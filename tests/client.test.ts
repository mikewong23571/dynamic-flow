import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptSnapshot,
  comparisonStale,
  inputFingerprint,
  materialInputs,
  localInputs,
  portLabel,
  removeNode,
  splitMaterials,
} from '../src/client/core/index.ts';
import type {
  Comparison,
  Definition,
  Inputs,
  Snapshot,
  Work,
} from '../src/shared/records';
const inputs: Inputs = {
  input: [
    {
      sampleId: 'M01',
      value: '顺手但导出失败',
      materialIds: ['M01'],
      sourceResultIds: [],
    },
    {
      sampleId: 'M03',
      value: '搜索很快',
      materialIds: ['M03'],
      sourceResultIds: [],
    },
  ],
};
test('真实多行材料拆分及空行保留语义', () => {
  assert.deepEqual(splitMaterials('第一条\n第二条\n\n第三条\n'), [
    '第一条',
    '第二条',
    '第三条',
  ]);
  assert.deepEqual(splitMaterials('  \n  '), []);
});
test('同输入比较忽略列表顺序但检测内容、来源、端口与版本变化', () => {
  const comparison = { candidateId: 'v2', frozenInputs: inputs } as Comparison;
  const reordered = { input: [...inputs.input].reverse() };
  assert.equal(inputFingerprint(inputs), inputFingerprint(reordered));
  assert.equal(comparisonStale(comparison, 'v2', reordered), false);
  assert.equal(comparisonStale(comparison, 'v2', reordered, true), true);
  assert.equal(comparisonStale(comparison, 'v3', inputs), true);
  assert.equal(
    comparisonStale(comparison, 'v2', {
      input: [
        { ...inputs.input[0], sourceResultIds: ['older-result'] },
        inputs.input[1],
      ],
    }),
    true,
  );
  assert.equal(comparisonStale(comparison, 'v2', { left: inputs.input }), true);
  assert.equal(
    comparisonStale(comparison, 'v2', { input: inputs.input.slice(1) }),
    true,
  );
});
test('完整与局部运行显式选择端口和材料，不混入未选择材料', () => {
  const work = {
    materials: [
      { id: 'M01', text: 'A' },
      { id: 'M02', text: 'B' },
      { id: 'M03', text: 'C' },
    ],
  } as Work;
  assert.deepEqual(materialInputs(work, ['M01', 'M03'], 'feedback'), {
    feedback: [
      {
        sampleId: 'M01',
        value: 'A',
        materialIds: ['M01'],
        sourceResultIds: [],
      },
      {
        sampleId: 'M03',
        value: 'C',
        materialIds: ['M03'],
        sourceResultIds: [],
      },
    ],
  });
  assert.deepEqual(materialInputs(work, []), { input: [] });
});
test('SSE拒绝同工作旧revision，切工作接受新快照', () => {
  const previous = { work: { id: 'one', revision: 10 } } as Snapshot;
  const old = { work: { id: 'one', revision: 9 } } as Snapshot;
  const other = { work: { id: 'two', revision: 1 } } as Snapshot;
  assert.equal(acceptSnapshot(previous, old), previous);
  assert.equal(acceptSnapshot(previous, other), other);
});
test('删节点同时清理连接和流程输出，不留下不可见引用', () => {
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['materials'],
    nodes: [
      {
        id: 'a',
        label: 'A',
        kind: 'function',
        mode: 'each',
        functionName: 'identity',
      },
      {
        id: 'b',
        label: 'B',
        kind: 'function',
        mode: 'all',
        functionName: 'identity',
      },
    ],
    edges: [
      { from: ['$input', 'materials'], to: ['a', 'input'] },
      { from: ['a', 'output'], to: ['b', 'input'] },
    ],
    outputs: { report: ['b', 'output'], sample: ['a', 'output'] },
  };
  const removed = removeNode(definition, 'a');
  assert.deepEqual(
    removed.nodes.map((n) => n.id),
    ['b'],
  );
  assert.deepEqual(removed.edges, []);
  assert.deepEqual(removed.outputs, { report: ['b', 'output'] });
  assert.equal(definition.nodes.length, 2);
});

test('合并试验显式提供两端口并保留空分支，端口显示不改变协议名', () => {
  const node = {
    id: 'merge',
    label: '合并',
    kind: 'function' as const,
    mode: 'all' as const,
    functionName: 'merge' as const,
  };
  assert.deepEqual(localInputs(node, inputs, 'right'), {
    left: [],
    right: inputs.input,
  });
  assert.equal(portLabel('matched'), '符合条件');
  assert.equal(portLabel('customer-data'), 'customer-data');
});

test('等待端口同时保留输入透传和事件，删除时不留下事件引用', async () => {
  const { outputPorts, active, statusNames } =
    await import('../src/client/core/index.ts');
  const wait = {
    id: 'waiting',
    label: '等待公告',
    kind: 'wait' as const,
    mode: 'all' as const,
    wait: { event: 'announcement', reason: '等待公告' },
  };
  assert.deepEqual(outputPorts(wait), ['output', 'event']);
  assert.equal(portLabel('event'), '触发事件');
  assert.equal(active('waiting'), true);
  assert.equal(statusNames.waiting, '等待事件');
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['input'],
    nodes: [wait],
    edges: [{ from: ['$input', 'input'], to: ['waiting', 'input'] }],
    outputs: { event: ['waiting', 'event'], original: ['waiting', 'output'] },
  };
  assert.deepEqual(removeNode(definition, 'waiting'), {
    schemaVersion: 1,
    inputs: ['input'],
    nodes: [],
    edges: [],
    outputs: {},
  });
});

test('数据变换默认值与画布摘要区分节点调用和数组组合', async () => {
  const {
    newExpression,
    newPattern,
    expressionSummary,
    renameField,
    nextField,
  } = await import('../src/client/features/inspector/expression-model');
  assert.deepEqual(newExpression('variable'), {
    kind: 'variable',
    name: 'input',
  });
  assert.equal(
    expressionSummary({
      kind: 'pipe',
      input: newExpression('variable'),
      steps: [
        newExpression('filter'),
        newExpression('map'),
        newExpression('reduce'),
      ],
    }),
    '筛选 → 逐项映射 → 顺序归约',
  );
  assert.equal(
    expressionSummary({
      kind: 'pipe',
      input: newExpression('variable'),
      steps: [],
    }),
    '原样传递',
  );
  assert.deepEqual(newPattern('array'), {
    kind: 'array',
    items: [{ kind: 'bind', name: 'item' }],
    rest: 'rest',
  });
  assert.deepEqual(renameField({ a: 1, b: 2 }, 'a', 'label'), {
    label: 1,
    b: 2,
  });
  assert.equal(nextField({ field1: 0, field3: 0 }), 'field2');
});
