import {
  BaseEdge,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import type { LayoutPoint } from './canvas-layout';
import { routeMidpoint } from './canvas-view';
type RoutedData = { points?: LayoutPoint[]; description: string };
export function WorkflowEdge(props: EdgeProps<Edge<RoutedData>>) {
  const { data, sourceX, sourceY, targetX, targetY } = props;
  const points = data?.points;
  // A dragged node or newly measured handle invalidates the old routed endpoints.
  const near = (a: number, b: number) => Math.abs(a - b) < 2;
  const routed =
    points &&
    points.length >= 2 &&
    near(points[0].x, sourceX) &&
    near(points[0].y, sourceY) &&
    near(points.at(-1)!.x, targetX) &&
    near(points.at(-1)!.y, targetY);
  const [fallback, fallbackX, fallbackY] = getSmoothStepPath(props);
  const { x: labelX, y: labelY } = routed
    ? routeMidpoint(points)
    : { x: fallbackX, y: fallbackY };
  const path = routed
    ? points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
    : fallback;
  return (
    <g data-routing={routed ? 'elk' : 'direct'}>
      <title>{data?.description}</title>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        markerStart={props.markerStart}
        style={props.style}
        interactionWidth={20}
        label={props.label}
        labelX={labelX}
        labelY={labelY}
        labelStyle={props.labelStyle}
        labelBgStyle={props.labelBgStyle}
      />
    </g>
  );
}
