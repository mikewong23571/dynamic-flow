import type { Definition, FlowNode, Json } from '../shared/records';
import { nodeInputPorts } from '../shared/node-ports';

export const joinNames = {
  inner: '仅匹配',
  left: '保留左路',
  right: '保留右路',
  full: '保留两路',
};

export function collectionSummary(node: FlowNode) {
  if (node.functionName === 'join')
    return `按键关联 · ${joinNames[node.join?.type || 'inner']}`;
  if (node.functionName === 'collect')
    return `具名收集 · ${nodeInputPorts(node).length} 路`;
  if (node.functionName === 'merge')
    return `多路汇合 · ${nodeInputPorts(node).length} 路`;
  return '';
}

export function changeFunction(
  definition: Definition,
  nodeId: string,
  functionName: FlowNode['functionName'],
): Definition {
  const old = definition.nodes.find((n) => n.id === nodeId)!;
  const collection = ['merge', 'collect', 'join'].includes(functionName || '');
  const node: FlowNode = {
    ...old,
    functionName,
    inputNames:
      functionName === 'merge' || functionName === 'collect'
        ? old.inputNames || ['left', 'right']
        : undefined,
    join:
      functionName === 'join'
        ? old.join || {
            type: 'inner',
            leftKey: ['id'],
            rightKey: ['id'],
            duplicates: 'all',
          }
        : undefined,
    ...(collection ? { mode: 'all', operation: 'aggregate' } : {}),
    ...(functionName === 'expression'
      ? {
          expression: old.expression || { kind: 'variable', name: 'input' },
          operation:
            old.operation || (old.mode === 'all' ? 'aggregate' : 'map'),
        }
      : {}),
  };
  const ports = nodeInputPorts(node);
  return {
    ...definition,
    nodes: definition.nodes.map((n) => (n.id === nodeId ? node : n)),
    edges: definition.edges.filter(
      (e) => e.to[0] !== nodeId || ports.includes(e.to[1]),
    ),
  };
}

export function changeInputNames(
  definition: Definition,
  nodeId: string,
  names: string[],
  rename?: [string, string],
): Definition {
  return {
    ...definition,
    nodes: definition.nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            inputNames: names,
            mode: 'all',
            operation: 'aggregate',
            inputSchema: changePortSchema(
              n.inputSchema,
              nodeInputPorts(n),
              names,
              rename,
            ),
            ...(n.functionName === 'collect'
              ? {
                  expectedOutput: changePortSchema(
                    n.expectedOutput,
                    nodeInputPorts(n),
                    names,
                    rename,
                  ),
                }
              : {}),
          }
        : n,
    ),
    edges: definition.edges
      .map((e) =>
        e.to[0] === nodeId && rename && e.to[1] === rename[0]
          ? { ...e, to: [nodeId, rename[1]] as [string, string] }
          : e,
      )
      .filter((e) => e.to[0] !== nodeId || names.includes(e.to[1])),
  };
}

function changePortSchema(
  schema: Json | undefined,
  previous: string[],
  names: string[],
  rename?: [string, string],
): Json | undefined {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    return schema;
  const renamed = (name: string) =>
    rename && name === rename[0] ? rename[1] : name;
  const kept = (name: string) =>
    !previous.includes(name) || names.includes(renamed(name));
  return {
    ...schema,
    ...(schema.properties &&
    typeof schema.properties === 'object' &&
    !Array.isArray(schema.properties)
      ? {
          properties: Object.fromEntries(
            Object.entries(schema.properties)
              .filter(([key]) => kept(key))
              .map(([key, value]) => [renamed(key), value]),
          ),
        }
      : {}),
    ...(Array.isArray(schema.required)
      ? {
          required: schema.required
            .filter((value) => typeof value !== 'string' || kept(value))
            .map((value) =>
              typeof value === 'string' ? renamed(value) : value,
            ),
        }
      : {}),
  };
}
