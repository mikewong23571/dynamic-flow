import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Panel,
  applyNodeChanges,
  MarkerType,
  type Node,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LayoutGrid, Focus, ListTree, LoaderCircle } from 'lucide-react';
import type { Definition, Run, ViewState } from '../../../shared/records';
import { WorkflowNode, type CanvasData } from './WorkflowNode';
import { WorkflowEdge } from './WorkflowEdge';
import { focusedEdges, canvasFitOptions, type PortFocus } from './canvas-view';
import { useCanvasLayout } from './useCanvasLayout';
import { inputPorts, outputPorts } from '../../core/inputs';
import { nodeTotal } from '../../core/results';
import { isFinalOutput, nodeLabel } from '../../core/definition';
import { portLabel } from '../../core/format';
import { Button } from '../../components/ui';
import './WorkflowCanvas.css';

type CanvasNode = Node<CanvasData>;
type Props = {
  definition: Definition;
  view: ViewState;
  selected?: string;
  onSelect: (id?: string) => void;
  onChange: (definition: Definition) => void;
  onLayout: (view: ViewState) => void;
  run?: Run;
  disabled?: boolean;
};
const nodeTypes = { workflow: WorkflowNode };
const edgeTypes = { routed: WorkflowEdge };
export function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
function Canvas({
  definition,
  view,
  selected,
  onSelect,
  onChange,
  onLayout,
  run,
  disabled,
}: Props) {
  const [portFocus, setPortFocus] = useState<PortFocus>();
  const [edgeFocus, setEdgeFocus] = useState<string>();
  const [focus, setFocus] = useState(true);
  const focusGraphKey = useMemo(
    () =>
      JSON.stringify({
        edges: definition.edges,
        ports: definition.nodes.map((node) => [
          node.id,
          inputPorts(node),
          outputPorts(node),
        ]),
        inputs: definition.inputs,
      }),
    [definition],
  );
  useEffect(() => {
    setPortFocus(undefined);
    setEdgeFocus(undefined);
  }, [focusGraphKey]);
  const hoverPort = useCallback(
    (port?: PortFocus) =>
      setPortFocus((current) =>
        JSON.stringify(current) === JSON.stringify(port) ? current : port,
      ),
    [],
  );
  const makeNodes = useCallback(
    (): CanvasNode[] => [
      {
        id: '$input',
        deletable: false,
        type: 'workflow',
        position: view.positions.$input || { x: 35, y: 35 },
        data: {
          label: '工作材料',
          ports: definition.inputs,
          onPortFocus: hoverPort,
        },
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
          onPortFocus: hoverPort,
          status: run?.nodeStates[node.id],
          final: isFinalOutput(definition, node.id),
          progress: run?.results.some((r) => r.nodeId === node.id)
            ? `${run.results.filter((r) => r.nodeId === node.id && r.status === 'completed' && !r.intermediate && !r.purpose).length} / ${nodeTotal(run, node.id)}`
            : undefined,
        },
      })),
    ],
    [view.positions, definition, selected, run, hoverPort],
  );
  const [nodes, setNodes] = useState(makeNodes);
  useEffect(() => {
    setNodes((previous) =>
      makeNodes().map((node) => {
        const old = previous.find((p) => p.id === node.id);
        return { ...old, ...node, position: old?.position || node.position };
      }),
    );
  }, [makeNodes]);
  const {
    initialized,
    showPorts,
    busy,
    layoutError,
    validRoutes,
    arrange,
    saveLayout,
    manualMove,
    togglePorts,
  } = useCanvasLayout({ definition, view, nodes, setNodes, onLayout });
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
  const active = Boolean(portFocus || edgeFocus || (focus && selected));
  const highlighted = useMemo(
    () =>
      edgeFocus
        ? new Set([edgeFocus])
        : focusedEdges(definition, focus ? selected : undefined, portFocus),
    [edgeFocus, focus, selected, portFocus, definition],
  );
  const related = useMemo(() => {
    const ids = new Set<string>([portFocus?.nodeId || selected || '']);
    definition.edges.forEach((edge, i) => {
      if (highlighted.has(`edge-${i}`)) {
        ids.add(edge.from[0]);
        ids.add(edge.to[0]);
      }
    });
    return ids;
  }, [definition, highlighted, portFocus, selected]);
  const description = (e: Definition['edges'][number]) =>
    `${nodeLabel(definition, e.from[0])} · ${portLabel(e.from[1])} → ${nodeLabel(definition, e.to[0])} · ${portLabel(e.to[1])}`;
  const edges = useMemo(
    () =>
      definition.edges.map((e, i) => ({
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
        type: 'routed',
        data: {
          points: validRoutes?.[`edge-${i}`],
          description: description(e),
        },
        className: active
          ? highlighted.has(`edge-${i}`)
            ? 'connection-focus'
            : 'connection-dim'
          : '',
        zIndex: active && highlighted.has(`edge-${i}`) ? 10 : 0,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: run?.nodeStates[e.to[0]] === 'running',
      })),
    [definition, active, highlighted, validRoutes, run],
  );
  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        className: active && !related.has(n.id) ? 'connection-dim' : '',
      })),
    [nodes, active, related],
  );
  const focusedDescriptions = definition.edges
    .filter((_, i) => highlighted.has(`edge-${i}`))
    .map(description);
  return (
    <div
      className={`canvas ${showPorts ? 'canvas--ports' : 'canvas--overview'}`}
    >
      <ReactFlow<CanvasNode>
        colorMode="dark"
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={(changes) =>
          setNodes((ns) => applyNodeChanges(changes, ns))
        }
        onNodeClick={(_, n) => n.id !== '$input' && onSelect(n.id)}
        onPaneClick={() => {
          onSelect(undefined);
          setPortFocus(undefined);
          setEdgeFocus(undefined);
        }}
        onConnect={connect}
        onEdgeMouseEnter={(_, e) => setEdgeFocus(e.id)}
        onEdgeMouseLeave={() => setEdgeFocus(undefined)}
        onEdgesDelete={(deleted) =>
          onChange({
            ...definition,
            edges: definition.edges.filter(
              (_, i) => !deleted.some((d) => d.id === `edge-${i}`),
            ),
          })
        }
        onNodeDragStart={manualMove}
        onNodeDragStop={() => saveLayout()}
        onMoveStart={(event) => {
          if (event) manualMove();
        }}
        onMoveEnd={(_, viewport) => saveLayout(viewport)}
        nodesConnectable={!disabled}
        deleteKeyCode={['Backspace', 'Delete']}
        edgesFocusable={!disabled}
        defaultViewport={view.viewport || { x: 25, y: 30, zoom: 1 }}
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background gap={24} size={1} color="var(--canvas-grid)" />
        <Controls showInteractive={false} fitViewOptions={canvasFitOptions} />
        <Panel position="top-right">
          <div className="canvas-actions">
            <Button
              variant="ghost"
              aria-label="整理布局"
              title="按依赖整理布局"
              disabled={!initialized || busy}
              onClick={() => void arrange()}
            >
              {busy ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <LayoutGrid size={14} />
              )}
              <span>{busy ? '整理中' : '整理布局'}</span>
            </Button>
            <Button
              variant="ghost"
              aria-label="聚焦连接"
              title="选中节点时突出相关连接"
              aria-pressed={focus}
              onClick={() => setFocus(!focus)}
            >
              <Focus size={14} />
              <span>聚焦连接</span>
            </Button>
            <Button
              variant="ghost"
              aria-label="显示端口"
              title="始终显示端口名称"
              aria-pressed={showPorts}
              onClick={togglePorts}
            >
              <ListTree size={14} />
              <span>显示端口</span>
            </Button>
          </div>
        </Panel>
        {layoutError && (
          <Panel position="bottom-center">
            <div role="alert" className="canvas-layout-error">
              {layoutError}
            </div>
          </Panel>
        )}
        {!layoutError &&
          (portFocus || edgeFocus) &&
          focusedDescriptions.length > 0 && (
            <Panel position="bottom-center">
              <div role="status" className="canvas-connection-info">
                {focusedDescriptions.slice(0, 3).map((text) => (
                  <div key={text}>{text}</div>
                ))}
                {focusedDescriptions.length > 3 && (
                  <div>共 {focusedDescriptions.length} 条连接</div>
                )}
              </div>
            </Panel>
          )}
      </ReactFlow>
    </div>
  );
}
