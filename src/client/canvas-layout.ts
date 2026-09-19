import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode, ElkPort } from 'elkjs/lib/elk-api';
import type { Definition } from '../shared/records';

export interface LayoutPort {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  inputs: LayoutPort[];
  outputs: LayoutPort[];
}

export interface LayoutPoint {
  x: number;
  y: number;
}

function checkMeasurements(node: LayoutNode) {
  if (
    !Number.isFinite(node.width) ||
    node.width <= 0 ||
    !Number.isFinite(node.height) ||
    node.height <= 0
  )
    throw new Error(`节点 ${node.id} 的尺寸尚未就绪`);
  for (const port of [...node.inputs, ...node.outputs]) {
    if (
      !Number.isFinite(port.x) ||
      !Number.isFinite(port.y) ||
      !Number.isFinite(port.width) ||
      port.width < 0 ||
      !Number.isFinite(port.height) ||
      port.height < 0
    )
      throw new Error(`节点 ${node.id} 的端口 ${port.id} 尺寸尚未就绪`);
  }
}

export async function layoutWorkflow(
  definition: Definition,
  nodes: LayoutNode[],
): Promise<{
  positions: Record<string, LayoutPoint>;
  routes: Record<string, LayoutPoint[]>;
}> {
  const measurements = new Map(nodes.map((node) => [node.id, node]));
  for (const id of ['$input', ...definition.nodes.map((node) => node.id)]) {
    if (!measurements.has(id)) throw new Error(`节点 ${id} 的尺寸尚未就绪`);
  }
  nodes.forEach(checkMeasurements);
  const inputPorts = new Map<string, Map<string, string>>();
  const outputPorts = new Map<string, Map<string, string>>();
  const children: ElkNode[] = nodes.map((node, nodeIndex) => {
    const ports = (values: LayoutPort[], side: 'WEST' | 'EAST'): ElkPort[] => {
      const ids = new Map<string, string>();
      (side === 'WEST' ? inputPorts : outputPorts).set(node.id, ids);
      return values.map((port, portIndex) => {
        const id = `port-${nodeIndex}-${side}-${portIndex}`;
        ids.set(port.id, id);
        return {
          id,
          x: port.x,
          y: port.y,
          width: port.width,
          height: port.height,
          layoutOptions: {
            'elk.port.side': side,
            // React Flow handles straddle the border; ELK otherwise places them fully outside.
            'elk.port.borderOffset': String(
              side === 'EAST' ? port.x - node.width : -port.x - port.width,
            ),
          },
        };
      });
    };
    return {
      id: `node-${nodeIndex}`,
      width: node.width,
      height: node.height,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: [...ports(node.inputs, 'WEST'), ...ports(node.outputs, 'EAST')],
    };
  });
  const edges = definition.edges.flatMap((edge, index) => {
    const source = outputPorts.get(edge.from[0])?.get(edge.from[1]);
    const target = inputPorts.get(edge.to[0])?.get(edge.to[1]);
    return source && target
      ? [{ id: `edge-${index}`, sources: [source], targets: [target] }]
      : [];
  });
  const elk = new ELK();
  const graph = await elk.layout<ElkNode>({
    id: 'workflow',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.randomSeed': '1',
      'elk.padding': '[top=32,left=32,bottom=32,right=32]',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '104',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '16',
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '16',
      'elk.separateConnectedComponents': 'true',
    },
    children,
    edges,
  } satisfies ElkNode);
  const positions: Record<string, LayoutPoint> = {};
  for (const node of graph.children ?? []) {
    const original = nodes[Number(node.id.slice('node-'.length))];
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      throw new Error(`节点 ${original.id} 未取得有效布局`);
    }
    positions[original.id] = { x: node.x!, y: node.y! };
  }
  const routes: Record<string, LayoutPoint[]> = {};
  for (const edge of graph.edges ?? []) {
    const sections = edge.sections ?? [];
    routes[edge.id] = sections.flatMap((section) => [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ]);
  }
  return { positions, routes };
}
