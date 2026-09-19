import { useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  type Node,
  type NodeProps,
  type Connection,
  type Viewport,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Boxes,
  GitBranch,
  Bot,
  FileText,
  Check,
  LoaderCircle,
  AlertCircle,
} from 'lucide-react';
import type { Definition, FlowNode, Run, ViewState } from '../shared/records';
import {
  inputPorts,
  outputPorts,
  statusNames,
  portLabel,
  nodeTotal,
} from './model';

type CanvasData = {
  label: string;
  node?: FlowNode;
  ports?: string[];
  status?: string;
  progress?: string;
  final?: boolean;
};
function WorkflowNode({ data, selected }: NodeProps<Node<CanvasData>>) {
  const { node } = data;
  const Icon = !node
    ? FileText
    : node.kind === 'agent'
      ? Bot
      : node.kind === 'branch'
        ? GitBranch
        : Boxes;
  const inputs = node ? inputPorts(node) : [];
  const outputs = node ? outputPorts(node) : data.ports || [];
  const state = data.status;
  return (
    <div
      className={`workflow-node ${selected ? 'selected' : ''} ${state || ''}`}
    >
      <div className="node-heading">
        <span className={`node-icon ${node?.kind || 'material'}`}>
          <Icon size={20} />
        </span>
        <div className="node-identity">
          <span className="node-kind">
            {!node
              ? '输入'
              : node.kind === 'agent'
                ? 'Agent'
                : node.kind === 'branch'
                  ? '条件分流'
                  : '数据处理'}
          </span>
          <strong title={data.label}>{data.label}</strong>
        </div>
      </div>
      {node?.kind === 'branch' && (
        <p
          className="node-condition"
          title={`${node.condition?.field || '整个输入'} ${node.condition?.operator || ''} ${String(node.condition?.value ?? '')}`}
        >
          {node.condition?.field || '整个输入'} ·{' '}
          {node.condition?.operator === 'contains'
            ? '包含'
            : node.condition?.operator === 'equals'
              ? '等于'
              : '存在'}{' '}
          {String(node.condition?.value ?? '')}
        </p>
      )}
      <div className="node-summary">
        <span>
          {node ? (node.mode === 'each' ? '逐条处理' : '汇总处理') : '原始材料'}
          {data.final && <span className="node-final">最终产物</span>}
        </span>
        {node && (
          <span
            className={`node-status ${state || ''}`}
            title={statusNames[state || ''] || '待运行'}
          >
            {state === 'completed' ? (
              <Check size={12} />
            ) : state === 'running' ? (
              <LoaderCircle size={12} className="spin" />
            ) : state === 'failed' || state === 'blocked' ? (
              <AlertCircle size={12} />
            ) : null}
            {data.progress || statusNames[state || ''] || '待运行'}
          </span>
        )}
      </div>
      <div className="node-ports">
        <div className="port-column">
          {inputs.map((port) => (
            <div key={port} className="node-port input">
              <Handle
                type="target"
                position={Position.Left}
                id={port}
                aria-label={`输入 ${portLabel(port)}`}
              />
              <span>{portLabel(port)}</span>
            </div>
          ))}
        </div>
        <div className="port-column">
          {outputs.map((port) => (
            <div key={port} className="node-port output">
              <span>{portLabel(port)}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={port}
                aria-label={`输出 ${portLabel(port)}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
const nodeTypes = { workflow: WorkflowNode };
export function WorkflowCanvas({
  definition,
  view,
  selected,
  onSelect,
  onChange,
  onLayout,
  run,
  disabled,
}: {
  definition: Definition;
  view: ViewState;
  selected?: string;
  onSelect: (id: string) => void;
  onChange: (d: Definition) => void;
  onLayout: (view: ViewState) => void;
  run?: Run;
  disabled?: boolean;
}) {
  const makeNodes = (): Node<CanvasData>[] => [
    {
      id: '$input',
      deletable: false,
      type: 'workflow',
      position: view.positions.$input || { x: 35, y: 35 },
      data: { label: '工作材料', ports: definition.inputs },
    },
    ...definition.nodes.map((node, index) => ({
      id: node.id,
      deletable: false,
      type: 'workflow',
      position: view.positions[node.id] || {
        x: 395 + Math.floor(index / 2) * 360,
        y: 35 + (index % 2) * 290,
      },
      selected: node.id === selected,
      data: {
        label: node.label,
        node,
        status: run?.nodeStates[node.id],
        final: Object.values(definition.outputs).some((v) => v[0] === node.id),
        progress: run?.results.some((r) => r.nodeId === node.id)
          ? `${run.results.filter((r) => r.nodeId === node.id && r.status === 'completed').length} / ${nodeTotal(run, node.id)}`
          : undefined,
      },
    })),
  ];
  const [nodes, setNodes] = useState(makeNodes);
  useEffect(() => {
    setNodes((prev) =>
      makeNodes().map((n) => ({
        ...n,
        position: prev.find((p) => p.id === n.id)?.position || n.position,
      })),
    );
  }, [definition, selected, run]);
  function connect(c: Connection) {
    if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return;
    onChange({
      ...definition,
      edges: [
        ...definition.edges,
        { from: [c.source, c.sourceHandle], to: [c.target, c.targetHandle] },
      ],
    });
  }
  const edges = definition.edges.map((e, i) => ({
    id: `edge-${i}`,
    source: e.from[0],
    target: e.to[0],
    sourceHandle: e.from[1],
    targetHandle: e.to[1],
    label:
      e.from[1] === 'matched'
        ? '符合条件'
        : e.from[1] === 'unmatched'
          ? '其他材料'
          : undefined,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: run?.nodeStates[e.to[0]] === 'running',
  }));
  function saveLayout(viewport?: Viewport) {
    onLayout({
      positions: Object.fromEntries(nodes.map((n) => [n.id, n.position])),
      viewport: viewport || view.viewport,
    });
  }
  return (
    <div className="canvas">
      <ReactFlow
        colorMode="dark"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) =>
          setNodes((ns) => applyNodeChanges(changes, ns))
        }
        onNodeClick={(_, n) => n.id !== '$input' && onSelect(n.id)}
        onConnect={connect}
        onEdgesDelete={(deleted) =>
          onChange({
            ...definition,
            edges: definition.edges.filter(
              (_, i) => !deleted.some((d) => d.id === `edge-${i}`),
            ),
          })
        }
        onNodeDragStop={() => saveLayout()}
        onMoveEnd={(_, viewport) => saveLayout(viewport)}
        nodesConnectable={!disabled}
        deleteKeyCode={['Backspace', 'Delete']}
        edgesFocusable={!disabled}
        defaultViewport={view.viewport || { x: 25, y: 30, zoom: 1 }}
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background gap={24} size={1} color="#282828" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
