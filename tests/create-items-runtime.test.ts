import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index.ts';
import { createFlow } from '../src/server/flow/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createRuns, type RunHooks } from '../src/server/runs/index.ts';
import type { Definition, Json, WorkItemInput } from '../src/shared/records.ts';
const definition: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  nodes: [
    {
      id: 'create',
      label: '建立子项',
      kind: 'create-items',

      operation: 'aggregate',
    },
  ],
  edges: [{ from: ['$input', 'input'], to: ['create', 'input'] }],
  outputs: { output: ['create', 'output'] },
};
const candidates = [
  {
    id: 'one',
    title: '处理反馈',
    goal: '确认原因',
    inputs: [{ label: '反馈', value: { subject: '连接失败' } }],
  },
];
async function setup(
  t: { after: (fn: () => Promise<unknown>) => void },
  hooks: RunHooks = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'create-items-'));
  const files = createFiles(root),
    flow = createFlow(files);
  const work = await createWorkService(files).createWork('拆分', ['原始材料']);
  const definitionId = await flow.saveDraft(work.id, undefined, definition);
  const runs = createRuns(
    files,
    async () => {
      throw Error('建项不得调用模型');
    },
    hooks,
  );
  t.after(async () => {
    runs.close();
    await rm(root, { recursive: true, force: true });
  });
  const workItem: WorkItemInput = {
    id: 'parent',
    key: 'P',
    title: '调查',
    goal: '完成调查',
    revision: 1,
    materials: [],
    data: {},
  };
  const inputs = {
    input: [0, 1].map((n) => ({
      sampleId: `sample-${n}`,
      value: candidates as Json,
      materialIds: [],
      sourceResultIds: [],
    })),
  };
  return { files, work, definitionId, runs, workItem, inputs };
}
test('自动建立：直接输入同名候选各有固定node-input来源；preview不写', async (t) => {
  const calls: unknown[] = [];
  const f = await setup(t, {
    onCreateItems: async (parentId, source) => {
      calls.push({ parentId, source });
      const run = (await f.files.read(f.work.id)).runs.find(
        (r) => r.id === source.runId,
      )!;
      assert.deepEqual(
        run.results.find((r) => r.id === source.resultId)!.input[source.port][
          source.index
        ].value,
        candidates,
      );
      return [
        {
          candidateId: 'one',
          status: 'created',
          childId: `child-${source.index}`,
          source,
        },
      ];
    },
  });
  const preview = await f.runs.start(f.work.id, {
    scope: 'full',
    definitionId: f.definitionId,
    inputs: f.inputs,
  });
  await f.runs.wait(preview);
  assert.equal(calls.length, 0);
  const run = await f.runs.start(f.work.id, {
    scope: 'full',
    definitionId: f.definitionId,
    inputs: f.inputs,
    workItem: f.workItem,
    effectMode: 'commit',
  });
  await f.runs.wait(run);
  const saved = (await f.files.read(f.work.id)).runs.find((r) => r.id === run)!;
  assert.equal(saved.status, 'completed');
  assert.equal(calls.length, 2);
  assert.deepEqual(
    saved.results[0].outputs.output.map(
      (o) => (o.value as any).receipts[0].childId,
    ),
    ['child-0', 'child-1'],
  );
});

test('部分失败保留成功回执；普通retry、比较和单节点预览均不建立', async (t) => {
  let calls = 0;
  const f = await setup(t, {
    onCreateItems: async (_parent, source) => {
      calls++;
      return [
        {
          candidateId: 'one',
          status: source.index === 0 ? 'created' : 'needs-input',
          ...(source.index === 0
            ? { childId: 'saved' }
            : { error: '缺少目标' }),
          source,
        },
      ];
    },
  });
  const id = await f.runs.start(f.work.id, {
    scope: 'full',
    definitionId: f.definitionId,
    inputs: f.inputs,
    workItem: f.workItem,
    effectMode: 'commit',
  });
  await f.runs.wait(id);
  const run = (await f.files.read(f.work.id)).runs.find((r) => r.id === id)!;
  assert.equal(run.status, 'failed');
  assert.equal(run.results[0].outputs.output.length, 2);
  assert.match(run.results[0].error!, /部分子项/);
  const retry = await f.runs.retry(f.work.id, id, [run.results[0].id]);
  await f.runs.wait(retry);
  assert.equal(
    (await f.files.read(f.work.id)).runs.find((r) => r.id === retry)!
      .effectMode,
    'preview',
  );
  const compared = await f.runs.start(f.work.id, {
    scope: 'full',
    definitionId: f.definitionId,
    inputs: f.inputs,
    workItem: f.workItem,
    effectMode: 'commit',
    comparisonId: 'comparison',
  });
  await f.runs.wait(compared);
  assert.equal(calls, 2);
  await assert.rejects(
    f.runs.start(f.work.id, {
      scope: { nodeId: 'create' },
      commitScope: 'node',
      definitionId: f.definitionId,
      inputs: f.inputs,
      workItem: f.workItem,
      effectMode: 'commit',
    }),
    /正式单步骤/,
  );
});

test('停止保留已建立回执，不再调用后续候选容器', async (t) => {
  let enter!: () => void,
    release!: () => void,
    calls = 0;
  const entered = new Promise<void>((r) => (enter = r)),
    gate = new Promise<void>((r) => (release = r));
  const f = await setup(t, {
    onCreateItems: async (_parent, source, signal) => {
      calls++;
      enter();
      await gate;
      assert.equal(signal.aborted, true);
      return [
        { candidateId: 'one', status: 'created', childId: 'first', source },
      ];
    },
  });
  const id = await f.runs.start(f.work.id, {
    scope: 'full',
    definitionId: f.definitionId,
    inputs: f.inputs,
    workItem: f.workItem,
    effectMode: 'commit',
  });
  await entered;
  await f.runs.stop(f.work.id, id);
  release();
  await f.runs.wait(id);
  const run = (await f.files.read(f.work.id)).runs.find((r) => r.id === id)!;
  assert.equal(run.status, 'cancelled');
  assert.equal(calls, 1);
  assert.equal(run.results[0].outputs.output.length, 1);
});

test('中断恢复复用首次候选输入resultId，迟到旧hook不覆盖；输入变更明确拒绝', async (t) => {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => (enter = r)),
    gate = new Promise<void>((r) => (release = r));
  const sourceIds: string[] = [];
  const f = await setup(t, {
    onCreateItems: async (_parent, source) => {
      sourceIds.push(source.resultId);
      enter();
      await gate;
      return [
        { candidateId: 'one', status: 'created', childId: 'existing', source },
      ];
    },
  });
  const id = await f.runs.start(f.work.id, {
    scope: 'full',
    definitionId: f.definitionId,
    inputs: f.inputs,
    workItem: f.workItem,
    effectMode: 'commit',
  });
  await entered;
  f.runs.close();
  await f.files.onServerStart();
  const resumed = createRuns(
    f.files,
    async () => {
      throw Error('不得调用模型');
    },
    {
      onCreateItems: async (_parent, source) => {
        sourceIds.push(source.resultId);
        return [
          {
            candidateId: 'one',
            status: 'linked',
            childId: `existing-${source.index}`,
            source,
          },
        ];
      },
    },
  );
  t.after(async () => {
    resumed.close();
  });
  await resumed.resume(f.work.id, id);
  await resumed.wait(id);
  release();
  await f.runs.wait(id);
  let run = (await f.files.read(f.work.id)).runs.find((r) => r.id === id)!;
  assert.equal(run.status, 'completed');
  assert.equal(run.results.length, 1);
  assert.equal(new Set(sourceIds).size, 1);
  assert.equal(sourceIds.length, 3);
  assert.equal(
    (run.results[0].outputs.output[0].value as any).receipts[0].status,
    'linked',
  );
  // Simulate a corrupted recovery input, never reinterpret the saved origin.
  await f.files.change(f.work.id, (w) => {
    const r = w.runs.find((r) => r.id === id)!;
    r.status = 'interrupted';
    r.nodeStates.create = 'interrupted';
    r.results[0].status = 'interrupted';
    r.inputs.input[0].value = [{ ...candidates[0], goal: '改变目标' }];
  });
  await resumed.resume(f.work.id, id);
  await resumed.wait(id);
  run = (await f.files.read(f.work.id)).runs.find((r) => r.id === id)!;
  assert.equal(run.status, 'failed');
  assert.match(run.results[0].error!, /首次保存输入不一致/);
  assert.equal(sourceIds.length, 3);
});

test('业务hook异常也保留固定清单入口；无效候选不调用业务动作', async (t) => {
  let calls = 0;
  const f = await setup(t, {
    onCreateItems: async () => {
      calls++;
      throw Error('保存失败');
    },
  });
  const id = await f.runs.start(f.work.id, {
    scope: 'full',
    definitionId: f.definitionId,
    inputs: f.inputs,
    workItem: f.workItem,
    effectMode: 'commit',
  });
  await f.runs.wait(id);
  const run = (await f.files.read(f.work.id)).runs.find((r) => r.id === id)!;
  assert.equal(run.status, 'failed');
  assert.equal(calls, 1);
  const value = run.results[0].outputs.output[0].value as {
    source: { resultId: string };
    receipts: [];
  };
  assert.equal(value.source.resultId, run.results[0].id);
  assert.deepEqual(value.receipts, []);
  const invalid = await f.runs.start(f.work.id, {
    scope: 'full',
    definitionId: f.definitionId,
    inputs: {
      input: [
        {
          sampleId: 'bad',
          value: [{ id: 'a' }, { id: 'a' }],
          materialIds: [],
          sourceResultIds: [],
        },
      ],
    },
    workItem: f.workItem,
    effectMode: 'commit',
  });
  await f.runs.wait(invalid);
  assert.equal(
    (await f.files.read(f.work.id)).runs.find((r) => r.id === invalid)!.status,
    'failed',
  );
  assert.equal(calls, 1);
});
