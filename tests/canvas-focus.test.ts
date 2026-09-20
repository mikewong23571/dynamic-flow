import test from 'node:test';
import assert from 'node:assert/strict';
import {
  focusedEdges,
  routingSignature,
  routeMidpoint,
} from '../src/client/features/canvas/canvas-view.ts';
import type { Definition } from '../src/shared/records.ts';
import type { LayoutNode } from '../src/client/features/canvas/canvas-layout.ts';
const definition: Definition = {
  schemaVersion: 1,
  inputs: ['data'],
  nodes: [],
  edges: [
    { from: ['a', 'output'], to: ['g', 'one'] },
    { from: ['b', 'output'], to: ['g', 'two'] },
    { from: ['g', 'output'], to: ['c', 'input'] },
  ],
  outputs: {},
};
test('关系聚焦区分同名端口方向及直接邻居', () => {
  assert.deepEqual(
    [...focusedEdges(definition, 'g')],
    ['edge-0', 'edge-1', 'edge-2'],
  );
  assert.deepEqual(
    [
      ...focusedEdges(definition, 'g', {
        nodeId: 'g',
        id: 'two',
        direction: 'input',
      }),
    ],
    ['edge-1'],
  );
  assert.deepEqual(
    [
      ...focusedEdges(definition, 'g', {
        nodeId: 'g',
        id: 'output',
        direction: 'output',
      }),
    ],
    ['edge-2'],
  );
  assert.equal(focusedEdges(definition).size, 0);
});
test('路由签名忽略运行状态但在几何、端口、连接或坐标变化时失效', () => {
  const geometry: LayoutNode[] = [
    {
      id: 'g',
      width: 240,
      height: 170,
      inputs: [{ id: 'one', x: -4, y: 130, width: 8, height: 8 }],
      outputs: [],
    },
  ];
  const positions = { g: { x: 10, y: 10 } };
  const stamp = routingSignature(definition, geometry, positions);
  assert.equal(
    routingSignature(
      structuredClone(definition),
      structuredClone(geometry),
      positions,
    ),
    stamp,
  );
  assert.notEqual(
    routingSignature(definition, geometry, { g: { x: 11, y: 10 } }),
    stamp,
  );
  assert.notEqual(
    routingSignature(definition, [{ ...geometry[0], height: 190 }], positions),
    stamp,
  );
  assert.notEqual(
    routingSignature(
      definition,
      [
        {
          ...geometry[0],
          inputs: [{ ...geometry[0].inputs[0], id: 'renamed' }],
        },
      ],
      positions,
    ),
    stamp,
  );
  assert.notEqual(
    routingSignature(
      { ...definition, edges: definition.edges.slice(1) },
      geometry,
      positions,
    ),
    stamp,
  );
});

test('分支标签位于实际绕行折线，而非节点之间的假定中点', () => {
  assert.deepEqual(
    routeMidpoint([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 100 },
      { x: 100, y: 100 },
    ]),
    { x: 20, y: 80 },
  );
  assert.deepEqual(
    routeMidpoint([
      { x: 2, y: 3 },
      { x: 2, y: 3 },
    ]),
    { x: 2, y: 3 },
  );
});
