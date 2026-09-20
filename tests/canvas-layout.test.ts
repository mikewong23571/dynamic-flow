import test from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutWorkflow,
  type LayoutNode,
  type LayoutPoint,
} from '../src/client/features/canvas/canvas-layout';
import type { Definition } from '../src/shared/records';

function measure(
  id: string,
  inputs: string[],
  outputs: string[],
  width = 240,
  height = 128,
): LayoutNode {
  return {
    id,
    width,
    height,
    inputs: inputs.map((id, index) => ({
      id,
      x: -4,
      y: 20 + index * 28,
      width: 8,
      height: 8,
    })),
    outputs: outputs.map((id, index) => ({
      id,
      x: width - 4,
      y: 20 + index * 28,
      width: 8,
      height: 8,
    })),
  };
}

function fixture() {
  const names = ['investigation', 'remediation', 'verification'];
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['materials'],
    outputs: {},
    nodes: [
      ...names.map((id) => ({
        id,
        label: id,
        kind: 'function' as const,
        mode: 'each' as const,
        functionName: 'identity' as const,
      })),
      {
        id: 'collect',
        label: '收集',
        kind: 'function',
        mode: 'all',
        functionName: 'collect',
        inputNames: names,
      },
      {
        id: 'merge',
        label: '拼接',
        kind: 'function',
        mode: 'all',
        functionName: 'merge',
        inputNames: names,
      },
      {
        id: 'join',
        label: '关联',
        kind: 'function',
        mode: 'all',
        functionName: 'join',
        join: {
          type: 'full',
          leftKey: ['id'],
          rightKey: ['id'],
          duplicates: 'all',
        },
      },
    ],
    edges: [
      ...names.map((id) => ({
        from: ['$input', 'materials'] as [string, string],
        to: [id, 'input'] as [string, string],
      })),
      ...['collect', 'merge'].flatMap((target) =>
        names.map((id) => ({
          from: [id, 'output'] as [string, string],
          to: [target, id] as [string, string],
        })),
      ),
      { from: ['investigation', 'output'], to: ['join', 'left'] },
      { from: ['remediation', 'output'], to: ['join', 'right'] },
    ],
  };
  const nodes = [
    measure('$input', [], ['materials'], 188, 90),
    ...names.map((id, i) =>
      measure(id, ['input'], ['output'], 220 + 20 * i, 110 + 10 * i),
    ),
    measure('collect', names, ['output'], 270, 152),
    measure('merge', names, ['output'], 230, 160),
    measure('join', ['left', 'right'], ['output'], 290, 132),
  ];
  return { definition, nodes };
}

function verifyGeometry(
  definition: Definition,
  nodes: LayoutNode[],
  result: Awaited<ReturnType<typeof layoutWorkflow>>,
) {
  const { positions, routes } = result;
  assert.equal(Object.keys(positions).length, nodes.length);
  for (const [index, node] of nodes.entries()) {
    const a = positions[node.id];
    for (const other of nodes.slice(index + 1)) {
      const b = positions[other.id];
      assert.ok(
        a.x + node.width <= b.x ||
          b.x + other.width <= a.x ||
          a.y + node.height <= b.y ||
          b.y + other.height <= a.y,
        `${node.id} overlaps ${other.id}`,
      );
    }
  }
  for (const [index, edge] of definition.edges.entries()) {
    const source = nodes.find((node) => node.id === edge.from[0]);
    const target = nodes.find((node) => node.id === edge.to[0]);
    const sourcePort = source?.outputs.find((port) => port.id === edge.from[1]);
    const targetPort = target?.inputs.find((port) => port.id === edge.to[1]);
    if (!source || !target || !sourcePort || !targetPort) {
      assert.equal(routes[`edge-${index}`], undefined);
      continue;
    }
    const route = routes[`edge-${index}`];
    assert.ok(route.length >= 2, `edge-${index} has actual section endpoints`);
    assert.deepEqual(route[0], {
      x: positions[source.id].x + sourcePort.x + sourcePort.width,
      y: positions[source.id].y + sourcePort.y + sourcePort.height / 2,
    });
    assert.deepEqual(route.at(-1), {
      x: positions[target.id].x + targetPort.x,
      y: positions[target.id].y + targetPort.y + targetPort.height / 2,
    });
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      assert.ok(a.x === b.x || a.y === b.y, 'orthogonal ELK segment');
      const obstacles: LayoutNode[] = nodes.filter(
        (node) => node.id !== source.id && node.id !== target.id,
      );
      for (const obstacle of obstacles) {
        const p = positions[obstacle.id];
        assert.equal(
          intersects(a, b, p, obstacle),
          false,
          `edge-${index} crosses ${obstacle.id}`,
        );
      }
    }
  }
}

function intersects(
  a: LayoutPoint,
  b: LayoutPoint,
  p: LayoutPoint,
  size: LayoutNode,
) {
  return a.x === b.x
    ? a.x > p.x &&
        a.x < p.x + size.width &&
        Math.max(a.y, b.y) > p.y &&
        Math.min(a.y, b.y) < p.y + size.height
    : a.y > p.y &&
        a.y < p.y + size.height &&
        Math.max(a.x, b.x) > p.x &&
        Math.min(a.x, b.x) < p.x + size.width;
}

test('ELK routes three sources to collect, merge and join without overlaps or changing IR', async () => {
  const { definition, nodes } = fixture();
  const before = structuredClone({ definition, nodes });
  const result = await layoutWorkflow(definition, nodes);
  verifyGeometry(definition, nodes, result);
  assert.deepEqual({ definition, nodes }, before);
  assert.ok(
    Object.values(result.routes).some((points) => points.length > 2),
    'real bend points returned',
  );
  assert.ok(
    result.positions.collect.x >
      Math.max(
        ...['investigation', 'remediation', 'verification'].map(
          (id) => result.positions[id].x,
        ),
      ),
  );
  assert.equal(result.positions.collect.x, result.positions.merge.x);
  assert.equal(result.positions.merge.x, result.positions.join.x);
  assert.deepEqual(
    await layoutWorkflow(definition, nodes),
    result,
    'same measured graph is deterministic',
  );
});

test('dynamic and identically named input/output ports keep measured positions with disconnected nodes and draft edges', async () => {
  const { definition, nodes } = fixture();
  definition.nodes.push({
    id: 'disconnected',
    label: '待接线',
    kind: 'function',
    mode: 'all',
    functionName: 'collect',
    inputNames: ['a', 'b', 'c', 'd', 'e', 'f'],
  });
  nodes.push(
    measure('disconnected', ['a', 'b', 'c', 'd', 'e', 'f'], ['a'], 310, 220),
  );
  definition.edges.push({
    from: ['missing', 'output'],
    to: ['collect', 'investigation'],
  });
  definition.edges.push({
    from: ['collect', 'old-port'],
    to: ['join', 'left'],
  });
  const result = await layoutWorkflow(definition, nodes);
  verifyGeometry(definition, nodes, result);
  assert.equal(Object.keys(result.routes).length, definition.edges.length - 2);
  definition.edges.push({
    from: ['collect', 'output'],
    to: ['disconnected', 'f'],
  });
  verifyGeometry(definition, nodes, await layoutWorkflow(definition, nodes));
});

test('unmeasured nodes and invalid port geometry reject with a specific node instead of producing fabricated positions', async () => {
  const { definition, nodes } = fixture();
  await assert.rejects(
    layoutWorkflow(definition, nodes.slice(1)),
    /\$input.*尺寸/,
  );
  for (const invalid of [0, -1, NaN, Infinity]) {
    const changed = structuredClone(nodes);
    changed[1].width = invalid;
    await assert.rejects(
      layoutWorkflow(definition, changed),
      /investigation.*尺寸/,
    );
  }
  nodes[1].inputs[0].y = NaN;
  await assert.rejects(
    layoutWorkflow(definition, nodes),
    /investigation.*input.*尺寸/,
  );
});
