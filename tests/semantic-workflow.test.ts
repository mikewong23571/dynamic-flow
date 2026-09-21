import { comparisonResult } from '../src/client/core/results.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index.ts';
import { createFlow, checkDefinition } from '../src/server/flow/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createRuns } from '../src/server/runs/index.ts';
import type {
  Definition,
  FlowNode,
  Json,
  NodeExecution,
} from '../src/shared/records.ts';
const contract = {
  responsibility: '调查输入',
  done: '给出有依据的调查结论',
  rationale: '当前证据不足',
  semanticRole: '待调查材料',
};
const leaf: FlowNode = {
  id: 'step',
  label: '提取证据',
  kind: 'function',
  functionName: 'identity',
  mode: 'each',
  operation: 'map',
  contract,
};
const graph = (nodes: FlowNode[]): Definition => ({
  schemaVersion: 1,
  inputs: ['input'],
  nodes,
  edges: nodes.map((n, i) => ({
    from: [i ? nodes[i - 1].id : '$input', i ? 'output' : 'input'],
    to: [n.id, 'input'],
  })),
  outputs: { output: [nodes.at(-1)!.id, 'output'] },
});
const dynamic: FlowNode = {
  id: 'investigate',
  label: '局部调查',
  kind: 'dynamic',
  mode: 'all',
  operation: 'aggregate',
  task: '根据材料确定调查步骤',
  contract,
  dynamic: { boundary: '只调查当前材料', maxNodes: 5 },
};
async function fixture(
  definition: Definition,
  execute: (c: NodeExecution) => Promise<Json>,
) {
  const root = await mkdtemp(join(tmpdir(), 'semantic-flow-'));
  const files = createFiles(root),
    flow = createFlow(files);
  const work = await createWorkService(files).createWork('调查事实', ['材料']);
  const definitionId = await flow.saveDraft(work.id, undefined, definition);
  const runs = createRuns(files, execute);
  const start = () =>
    runs.start(work.id, {
      definitionId,
      scope: 'full',
      inputs: {
        input: [
          {
            sampleId: 'sample',
            value: 0,
            materialIds: [],
            sourceResultIds: [],
          },
        ],
      },
    });
  return {
    root,
    files,
    flow,
    work,
    definitionId,
    runs,
    start,
    async close() {
      runs.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test('动态展开先记录同一语言子图，执行具体工作并保持原定义', async () => {
  const definition = graph([dynamic, { ...leaf, id: 'report' }]);
  let calls = 0;
  const f = await fixture(definition, async () => {
    calls++;
    return graph([leaf]) as unknown as Json;
  });
  try {
    const id = await f.start();
    await f.runs.wait(id);
    const run = (await f.files.read(f.work.id)).runs[0];
    assert.equal(run.status, 'completed');
    assert.equal(calls, 1);
    assert.equal(run.expansions?.length, 1);
    assert.ok(
      run.results.some(
        (r) => r.nodeId === 'investigate/step' && r.status === 'completed',
      ),
    );
    assert.equal(
      run.results.find((r) => r.nodeId === 'report')?.outputs.output[0].value,
      0,
    );
    assert.deepEqual(
      await f.files.readDefinition(f.work.id, f.definitionId),
      definition,
    );
  } finally {
    await f.close();
  }
});
test('动态递归、超限与缺少具体责任都失败且不执行提案', async () => {
  for (const proposed of [
    graph([dynamic]),
    graph(Array.from({ length: 6 }, (_, i) => ({ ...leaf, id: `s${i}` }))),
    graph([{ ...leaf, contract: undefined }]),
  ]) {
    const f = await fixture(
      graph([dynamic]),
      async () => proposed as unknown as Json,
    );
    try {
      const id = await f.start();
      await f.runs.wait(id);
      const run = (await f.files.read(f.work.id)).runs[0];
      assert.equal(run.status, 'failed');
      assert.equal(run.expansions?.length ?? 0, 0);
      assert.ok(run.results[0].error);
    } finally {
      await f.close();
    }
  }
});
const repeating: FlowNode = {
  ...leaf,
  repeat: {
    max: 3,
    until: {
      kind: 'call',
      function: 'equal',
      args: [
        { kind: 'variable', name: 'input' },
        { kind: 'literal', value: 2 },
      ],
    },
  },
  functionName: 'expression',
  expression: {
    kind: 'call',
    function: 'add',
    args: [
      { kind: 'variable', name: 'input' },
      { kind: 'literal', value: 1 },
    ],
  },
};
test('有限迭代以真实输出判断停止，保留逐轮输入、最终输出和上限失败', async () => {
  for (const max of [3, 1]) {
    const f = await fixture(
      graph([
        { ...repeating, repeat: { ...repeating.repeat!, max } },
        { ...leaf, id: 'after' },
      ]),
      async () => {
        throw Error('不应调用模型');
      },
    );
    try {
      const id = await f.start();
      await f.runs.wait(id);
      const run = (await f.files.read(f.work.id)).runs[0];
      assert.equal(run.status, max === 3 ? 'completed' : 'failed');
      assert.equal(
        comparisonResult(run, 'step', 'sample')?.iteration,
        max === 3 ? 2 : 1,
      );
      const results = run.results.filter((r) => r.nodeId === 'step');
      assert.equal(results.length, max === 3 ? 2 : 1);
      if (max === 3) {
        assert.equal(results[1].input.input[0].value, 1);
        assert.equal(
          run.results.find((r) => r.nodeId === 'after')?.outputs.output[0]
            .value,
          2,
        );
      } else assert.match(results[0].error ?? '', /上限/);
    } finally {
      await f.close();
    }
  }
});
test('错误合同、无界迭代和无边界 Dynamic 在运行前被拒绝', () => {
  assert.ok(
    checkDefinition(graph([{ ...leaf, repeat: { max: 0 } }])).some((i) =>
      i.field?.startsWith('repeat'),
    ),
  );
  assert.ok(
    checkDefinition(
      graph([{ ...dynamic, dynamic: { boundary: '', maxNodes: 5 } }]),
    ).some((i) => i.field?.startsWith('dynamic')),
  );
  assert.ok(
    checkDefinition(
      graph([{ ...leaf, contract: { ...contract, done: '' } }]),
    ).some((i) => i.field?.startsWith('contract')),
  );
});

test('动态局部试运行、展开固化与责任变化冲突使用同一保存路径', async () => {
  const f = await fixture(
    graph([dynamic]),
    async () => graph([leaf]) as unknown as Json,
  );
  try {
    const runId = await f.runs.start(f.work.id, {
      definitionId: f.definitionId,
      scope: { nodeId: dynamic.id },
      inputs: {
        input: [
          {
            sampleId: 's',
            value: '事实',
            materialIds: [],
            sourceResultIds: [],
          },
        ],
      },
    });
    await f.runs.wait(runId);
    const run = (await f.files.read(f.work.id)).runs[0];
    assert.equal(run.status, 'completed');
    const id = await f.flow.freezeExpansion(
      f.work.id,
      f.definitionId,
      runId,
      dynamic.id,
    );
    const saved = await f.files.readDefinition(f.work.id, id);
    assert.ok(saved.nodes.some((n) => n.id === 'investigate/step'));
    assert.ok(!saved.nodes.some((n) => n.kind === 'dynamic'));
    assert.equal((await f.files.read(f.work.id)).adoptedId, undefined);
    await assert.rejects(
      f.flow.freezeExpansion(f.work.id, id, runId, dynamic.id),
      /修改/,
    );
  } finally {
    await f.close();
  }
});
test('动态展开中的等待跨运行器重开，规划和成功步骤不重跑', async () => {
  const proposed = graph([
    leaf,
    {
      id: 'wait',
      label: '等待补证',
      kind: 'wait',
      mode: 'all',
      wait: { event: 'evidence', reason: '缺少依据' },
      contract,
    },
    { ...leaf, id: 'after' },
  ]);
  let plans = 0;
  const f = await fixture(graph([dynamic]), async () => {
    plans++;
    return proposed as unknown as Json;
  });
  let resumed: ReturnType<typeof createRuns> | undefined;
  try {
    const runId = await f.runs.start(f.work.id, {
      definitionId: f.definitionId,
      scope: 'full',
      inputs: {
        input: [
          { sampleId: 's', value: 1, materialIds: [], sourceResultIds: [] },
        ],
      },
      effectMode: 'commit',
      workItem: {
        id: 'item',
        key: 'I',
        title: '调查',
        goal: '真实调查',
        revision: 1,
        data: {},
        materials: [],
      },
    });
    await f.runs.wait(runId);
    assert.equal((await f.files.read(f.work.id)).runs[0].status, 'waiting');
    f.runs.close();
    const files = createFiles(f.root);
    await files.onServerStart();
    resumed = createRuns(files, async () => {
      throw Error('不应重新规划');
    });
    await resumed.recover();
    await resumed.wait(runId);
    await resumed.signal(f.work.id, runId, { id: 'event', name: 'evidence' });
    await resumed.wait(runId);
    const run = (await files.read(f.work.id)).runs[0];
    assert.equal(run.status, 'completed');
    assert.equal(plans, 1);
    assert.equal(
      run.results.filter((r) => r.nodeId === 'investigate/step').length,
      1,
    );
  } finally {
    resumed?.close();
    await f.close();
  }
});
test('迭代从持久成功轮次恢复；停止后不进入下一轮', async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const node = { ...repeating, kind: 'agent' as const, task: '每轮加一' };
  const f = await fixture(graph([node]), async (c) => {
    if (c.iteration === 2) {
      entered();
      await pending;
    }
    return (c.inputs.input[0].value as number) + 1;
  });
  let resumed: ReturnType<typeof createRuns> | undefined;
  try {
    const runId = await f.start();
    await started;
    f.runs.close();
    release();
    await f.runs.wait(runId);
    const files = createFiles(f.root);
    await files.onServerStart();
    const rounds: number[] = [];
    resumed = createRuns(files, async (c) => {
      rounds.push(c.iteration!);
      return (c.inputs.input[0].value as number) + 1;
    });
    await resumed.resume(f.work.id, runId);
    await resumed.wait(runId);
    const run = (await files.read(f.work.id)).runs[0];
    assert.equal(run.status, 'completed');
    assert.deepEqual(rounds, [2]);
    assert.equal(run.results.filter((r) => r.iteration === 1).length, 1);
  } finally {
    resumed?.close();
    await f.close();
  }
});
test('停止中的动态模型迟到响应不物化；错误停止条件不被当成 true', async () => {
  let release!: (v: Json) => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((r) => {
    entered = r;
  });
  const f = await fixture(graph([dynamic]), () => {
    entered();
    return new Promise((r) => {
      release = r;
    });
  });
  try {
    const id = await f.start();
    await enteredPromise;
    await f.runs.stop(f.work.id, id);
    release(graph([leaf]) as unknown as Json);
    await f.runs.wait(id);
    const run = (await f.files.read(f.work.id)).runs[0];
    assert.equal(run.status, 'cancelled');
    assert.equal(run.expansions?.length ?? 0, 0);
  } finally {
    await f.close();
  }
  const g = await fixture(
    graph([
      {
        ...repeating,
        repeat: { max: 3, until: { kind: 'literal', value: 'yes' } },
      },
    ]),
    async () => 0,
  );
  try {
    const id = await g.start();
    await g.runs.wait(id);
    const run = (await g.files.read(g.work.id)).runs[0];
    assert.equal(run.status, 'failed');
    assert.match(run.results[0].error ?? '', /布尔/);
  } finally {
    await g.close();
  }
});

test('不同输入迭代轮数不同，等待恢复后仍保持输入顺序', async () => {
  const definition = graph([
    repeating,
    {
      id: 'pause',
      kind: 'wait',
      mode: 'all',
      label: '等待',
      wait: { event: 'continue', reason: '复核' },
    },
    { ...leaf, id: 'after' },
  ]);
  const f = await fixture(definition, async () => 0);
  try {
    const runId = await f.runs.start(f.work.id, {
      definitionId: f.definitionId,
      scope: 'full',
      inputs: {
        input: [0, 1].map((value, i) => ({
          sampleId: `s${i}`,
          value,
          materialIds: [],
          sourceResultIds: [],
        })),
      },
      effectMode: 'commit',
      workItem: {
        id: 'i',
        key: 'I',
        title: '调查',
        goal: '完成',
        revision: 1,
        data: {},
        materials: [],
      },
    });
    await f.runs.wait(runId);
    assert.equal((await f.files.read(f.work.id)).runs[0].status, 'waiting');
    await f.runs.signal(f.work.id, runId, { id: 'event', name: 'continue' });
    await f.runs.wait(runId);
    const run = (await f.files.read(f.work.id)).runs[0];
    assert.equal(run.status, 'completed');
    assert.deepEqual(
      run.results
        .filter((r) => r.nodeId === 'after')
        .flatMap((r) => r.outputs.output.map((i) => i.sampleId)),
      ['s0', 's1'],
    );
  } finally {
    await f.close();
  }
});

test('动态整批产物的比较沿来源回到原样本，不显示成功规划当作产物', async () => {
  const f = await fixture(
    graph([dynamic]),
    async () =>
      graph([
        { ...leaf, id: 'summary', mode: 'all', operation: 'aggregate' },
      ]) as unknown as Json,
  );
  try {
    const id = await f.runs.start(f.work.id, {
      definitionId: f.definitionId,
      scope: { nodeId: dynamic.id },
      inputs: {
        input: [0, 1].map((value, i) => ({
          sampleId: `s${i}`,
          value,
          materialIds: [],
          sourceResultIds: [],
        })),
      },
    });
    await f.runs.wait(id);
    const run = (await f.files.read(f.work.id)).runs[0];
    for (const sample of ['s0', 's1']) {
      const result = comparisonResult(run, dynamic.id, sample);
      assert.equal(result?.purpose, undefined);
      assert.equal(result?.nodeId, dynamic.id);
      assert.deepEqual(result?.outputs.output[0].value, [0, 1]);
    }
  } finally {
    await f.close();
  }
});
