import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  useNodesInitialized,
  useReactFlow,
  type Node,
  type Viewport,
} from '@xyflow/react';
import type { Definition, ViewState } from '../../../shared/records';
import type { CanvasData } from './WorkflowNode';
import type { LayoutNode } from './canvas-layout';
import { routingSignature, canvasFitOptions } from './canvas-view';
import { inputPorts, outputPorts } from '../../core/inputs';
import { errorText } from '../../core/format';

type CanvasNode = Node<CanvasData>;
type Options = {
  definition: Definition;
  view: ViewState;
  nodes: CanvasNode[];
  setNodes: Dispatch<SetStateAction<CanvasNode[]>>;
  onLayout: (view: ViewState) => void;
};
const nextMeasurement = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 40));

export function useCanvasLayout({
  definition,
  view,
  nodes,
  setNodes,
  onLayout,
}: Options) {
  const { getNodes, getInternalNode, fitView, getViewport } =
    useReactFlow<CanvasNode>();
  const initialized = useNodesInitialized();
  const [showPorts, setShowPorts] = useState(view.showPorts ?? false);
  const [routing, setRouting] = useState(view.routing);
  const [busy, setBusy] = useState(false);
  const [layoutError, setLayoutError] = useState('');
  const request = useRef(0);
  const initialLayout = useRef(Object.keys(view.positions).length === 0);
  const autoPending = useRef(false);
  const latest = useRef({ definition, onLayout });
  latest.current = { definition, onLayout };
  const routeRef = useRef(routing);
  const portsRef = useRef(showPorts);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);

  const geometry = useCallback(
    (): LayoutNode[] =>
      getNodes().map((n) => {
        const bounds = getInternalNode(n.id)?.internals.handleBounds;
        return {
          id: n.id,
          width: n.measured?.width || 0,
          height: n.measured?.height || 0,
          inputs: (bounds?.target || []).map((p) => ({
            id: p.id!,
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
          })),
          outputs: (bounds?.source || []).map((p) => ({
            id: p.id!,
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
          })),
        };
      }),
    [getNodes, getInternalNode],
  );

  const saveLayout = useCallback(
    (viewport?: Viewport, currentNodes = getNodes()) => {
      latest.current.onLayout({
        positions: Object.fromEntries(
          currentNodes.map((n) => [n.id, n.position]),
        ),
        viewport: viewport || getViewport(),
        showPorts: portsRef.current,
        routing: routeRef.current,
      });
    },
    [getNodes, getViewport],
  );

  const arrange = useCallback(async () => {
    if (!initialized) return;
    const generation = ++request.current;
    const captured = latest.current.definition;
    const graphKey = JSON.stringify(captured);
    const current = () =>
      mounted.current &&
      generation === request.current &&
      graphKey === JSON.stringify(latest.current.definition);
    const readReadyGeometry = async (): Promise<LayoutNode[] | undefined> => {
      for (let attempt = 0; attempt < 10 && current(); attempt++) {
        const measured = geometry();
        if (measurementsReady(captured, measured)) return measured;
        await nextMeasurement();
      }
      return undefined;
    };
    setBusy(true);
    setLayoutError('');
    try {
      let dimensions = await readReadyGeometry();
      if (!current()) return;
      initialLayout.current = false;
      if (!dimensions) throw Error('端口尺寸尚未就绪，请稍后再整理。');
      const { layoutWorkflow } = await import('./canvas-layout');
      for (let attempt = 0; attempt < 4 && current(); attempt++) {
        const measuredKey = routingSignature(captured, dimensions, {});
        const result = await layoutWorkflow(captured, dimensions);
        // Allow ResizeObserver and handle updates to settle before accepting ELK's result.
        await nextMeasurement();
        if (!current()) return;
        const measured = await readReadyGeometry();
        if (!current()) return;
        if (!measured) throw Error('端口正在更新，请稍后再整理。');
        if (measuredKey !== routingSignature(captured, measured, {})) {
          dimensions = measured;
          continue;
        }
        const next = getNodes().map((n) => ({
          ...n,
          position: result.positions[n.id] || n.position,
        }));
        const nextRouting = {
          signature: routingSignature(captured, dimensions, result.positions),
          routes: result.routes,
        };
        routeRef.current = nextRouting;
        setRouting(nextRouting);
        setNodes(next);
        saveLayout(undefined, next);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (current()) void fitView(canvasFitOptions);
          }),
        );
        return;
      }
      if (current()) throw Error('节点尺寸仍在变化，请稍后再整理。');
    } catch (error) {
      if (current()) setLayoutError(errorText(error));
    } finally {
      if (mounted.current && generation === request.current) setBusy(false);
    }
  }, [initialized, geometry, getNodes, setNodes, saveLayout, fitView]);

  useEffect(() => {
    if (!initialized || !initialLayout.current || autoPending.current) return;
    const frame = requestAnimationFrame(() => {
      autoPending.current = true;
      void arrange().finally(() => {
        autoPending.current = false;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialized, arrange]);

  function manualMove() {
    initialLayout.current = false;
    request.current++;
    setBusy(false);
  }
  function togglePorts() {
    portsRef.current = !portsRef.current;
    setShowPorts(portsRef.current);
    saveLayout();
  }
  const positions = useMemo(
    () => Object.fromEntries(nodes.map((n) => [n.id, n.position])),
    [nodes],
  );
  // 量到的尺寸和端口几何随 nodes 状态更新；只在它们变化时重算签名。
  const measured = useMemo(() => geometry(), [geometry, nodes, initialized]);
  const signature = useMemo(
    () => routingSignature(definition, measured, positions),
    [definition, measured, positions],
  );
  const validRoutes =
    initialized && routing?.signature === signature
      ? routing.routes
      : undefined;
  return {
    initialized,
    showPorts,
    busy,
    layoutError,
    validRoutes,
    arrange,
    saveLayout,
    manualMove,
    togglePorts,
  };
}

function measurementsReady(
  definition: Definition,
  geometry: LayoutNode[],
): boolean {
  const expected = new Map([
    ['$input', { inputs: [] as string[], outputs: definition.inputs }],
    ...definition.nodes.map(
      (node) =>
        [
          node.id,
          { inputs: inputPorts(node), outputs: outputPorts(node) },
        ] as const,
    ),
  ]);
  if (geometry.length !== expected.size) return false;
  return geometry.every((node) => {
    const ports = expected.get(node.id);
    return (
      ports &&
      Number.isFinite(node.width) &&
      node.width > 0 &&
      Number.isFinite(node.height) &&
      node.height > 0 &&
      ['inputs', 'outputs'].every((direction) => {
        const key = direction as 'inputs' | 'outputs';
        return (
          node[key].length === ports[key].length &&
          node[key].every(
            (port, i) =>
              port.id === ports[key][i] &&
              [port.x, port.y, port.width, port.height].every(Number.isFinite),
          )
        );
      })
    );
  });
}
