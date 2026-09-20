import type { FitViewOptions } from '@xyflow/react';
import type { Definition } from '../../../shared/records';
import type { LayoutNode, LayoutPoint } from './canvas-layout';

export type PortFocus = {
  nodeId: string;
  id: string;
  direction: 'input' | 'output';
};
export function focusedEdges(
  definition: Definition,
  selected?: string,
  port?: PortFocus,
): Set<string> {
  return new Set(
    definition.edges.flatMap((edge, i) => {
      const matches = port
        ? (port.direction === 'input' ? edge.to : edge.from).every(
            (v, j) => v === (j === 0 ? port.nodeId : port.id),
          )
        : edge.from[0] === selected || edge.to[0] === selected;
      return matches ? [`edge-${i}`] : [];
    }),
  );
}
export function routingSignature(
  definition: Definition,
  geometry: LayoutNode[],
  positions: Record<string, LayoutPoint>,
): string {
  const round = (value: number) => Math.round(value * 10) / 10;
  return JSON.stringify({
    edges: definition.edges,
    nodes: geometry.map((n) => ({
      id: n.id,
      width: round(n.width),
      height: round(n.height),
      position: positions[n.id] && {
        x: round(positions[n.id].x),
        y: round(positions[n.id].y),
      },
      inputs: n.inputs.map((p) => [
        p.id,
        round(p.x),
        round(p.y),
        round(p.width),
        round(p.height),
      ]),
      outputs: n.outputs.map((p) => [
        p.id,
        round(p.x),
        round(p.y),
        round(p.width),
        round(p.height),
      ]),
    })),
  });
}

/** Place labels on the actual routed polyline, including cross-layer detours. */
export function routeMidpoint(points: LayoutPoint[]): LayoutPoint {
  if (!points.length) return { x: 0, y: 0 };
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let remaining = lengths.reduce((sum, value) => sum + value, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] && lengths[i] > 0) {
      const ratio = remaining / lengths[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
        y: points[i].y + (points[i + 1].y - points[i].y) * ratio,
      };
    }
    remaining -= lengths[i];
  }
  return points[0];
}

// Reserve screen pixels for the floating toolbar and zoom controls at every zoom.
export const canvasFitOptions: FitViewOptions = {
  padding: { top: '72px', bottom: '48px', left: '32px', right: '32px' },
  maxZoom: 1,
  duration: 180,
};
