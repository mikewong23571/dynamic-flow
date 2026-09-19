import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index.ts';
import { createFlow } from '../src/server/flow/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createRuns } from '../src/server/runs/index.ts';
import type {
  Definition,
  Inputs,
  NodeExecution,
  Json,
} from '../src/shared/records.ts';
const base: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [
    {
      id: 'classify',
      kind: 'agent',
      label: '分类',
      mode: 'each',
      task: 'classify',
    },
    { id: 'report', kind: 'agent', label: '报告', mode: 'all', task: 'report' },
  ],
  edges: [
    { from: ['$input', 'materials'], to: ['classify', 'input'] },
    { from: ['classify', 'output'], to: ['report', 'input'] },
  ],
  outputs: { report: ['report', 'output'] },
};
async function setup(
  execute: (context: NodeExecution) => Promise<Json>,
  definition = base,
) {
  const dir = await mkdtemp(join(tmpdir(), 'dynamic-run-'));
  const files = createFiles(dir),
    flow = createFlow(files),
    workService = createWorkService(files);
  const work = await workService.createWork('分析反馈', [
    '好用',
    '有问题',
    '建议',
  ]);
  const id = await flow.saveDraft(work.id, undefined, definition);
  const inputs: Inputs = {
    materials: work.materials.map((m) => ({
      sampleId: m.id,
      value: m.text,
      materialIds: [m.id],
      sourceResultIds: [],
    })),
  };
  const runs = createRuns(files, execute);
  return {
    files,
    flow,
    work,
    id,
    inputs,
    runs,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
test('逐项失败保留其它成果，阻止汇总，重试只有选定失败输入', async () => {
  let calls: string[] = [];
  let fail = true;
  const t = await setup(async (c) => {
    const v = Object.values(c.inputs).flat();
    calls.push(c.node.id + ':' + v.map((i) => i.value).join(','));
    if (fail && v[0]?.value === '有问题') throw Error('端点暂不可用');
    return v.map((i) => i.value) as Json;
  });
  try {
    const id = await t.runs.start(t.work.id, {
      definitionId: t.id,
      scope: 'full',
      inputs: t.inputs,
    });
    await t.runs.wait(id);
    let run = (await t.files.read(t.work.id)).runs[0];
    assert.equal(run.status, 'failed');
    assert.equal(run.results.filter((r) => r.status === 'completed').length, 2);
    assert.equal(run.nodeStates.report, 'blocked');
    assert.equal(calls.length, 3);
    fail = false;
    const retry = await t.runs.retry(
      t.work.id,
      id,
      run.results.filter((r) => r.status === 'failed').map((r) => r.id),
    );
    await t.runs.wait(retry);
    assert.equal(calls.length, 4);
    assert.equal((await t.files.read(t.work.id)).runs[1].results.length, 1);
  } finally {
    await t.cleanup();
  }
});
test('停止后的迟到结果被忽略且不执行下游，活跃运行不允许重复启动', async () => {
  let release!: (value: Json) => void;
  let started!: () => void;
  const ready = new Promise<void>((r) => (started = r));
  const t = await setup(async () => {
    started();
    return new Promise<Json>((r) => (release = r));
  });
  try {
    const id = await t.runs.start(t.work.id, {
      definitionId: t.id,
      scope: 'full',
      inputs: t.inputs,
    });
    await ready;
    await assert.rejects(
      t.runs.start(t.work.id, {
        definitionId: t.id,
        scope: 'full',
        inputs: t.inputs,
      }),
      /运行|忙/,
    );
    await t.runs.stop(t.work.id, id);
    release('迟到');
    await t.runs.wait(id);
    const r = (await t.files.read(t.work.id)).runs[0];
    assert.equal(r.status, 'cancelled');
    assert.equal(r.results.filter((x) => x.status === 'completed').length, 0);
    assert.notEqual(r.nodeStates.report, 'completed');
  } finally {
    await t.cleanup();
  }
});
test('空分支逐项零调用、汇合端口就绪、来源沿实际输入保留', async () => {
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['materials'],
    nodes: [
      {
        id: 'branch',
        label: '条件',
        kind: 'branch',
        mode: 'all',
        condition: { field: '', operator: 'equals', value: '不存在' },
      },
      { id: 'yes', label: '匹配', kind: 'agent', mode: 'each', task: 'yes' },
      {
        id: 'no',
        label: '其它',
        kind: 'function',
        mode: 'each',
        functionName: 'identity',
      },
      {
        id: 'merge',
        label: '汇合',
        kind: 'function',
        mode: 'all',
        functionName: 'merge',
      },
    ],
    edges: [
      { from: ['$input', 'materials'], to: ['branch', 'input'] },
      { from: ['branch', 'matched'], to: ['yes', 'input'] },
      { from: ['branch', 'unmatched'], to: ['no', 'input'] },
      { from: ['yes', 'output'], to: ['merge', 'left'] },
      { from: ['no', 'output'], to: ['merge', 'right'] },
    ],
    outputs: { result: ['merge', 'output'] },
  };
  let calls = 0;
  const t = await setup(async () => {
    calls++;
    return 'unexpected';
  }, definition);
  try {
    const id = await t.runs.start(t.work.id, {
      definitionId: t.id,
      scope: 'full',
      inputs: t.inputs,
    });
    await t.runs.wait(id);
    const r = (await t.files.read(t.work.id)).runs[0];
    assert.equal(r.status, 'completed');
    assert.equal(calls, 0);
    const merged = r.results.find((x) => x.nodeId === 'merge')!;
    assert.equal(merged.outputs.output.length, 3);
    assert.equal(merged.input.left.length, 0);
    assert.equal(merged.outputs.output[0].sourceResultIds[0], merged.id);
  } finally {
    await t.cleanup();
  }
});

test('执行固定版本与输入，工具同名ID按实例归属，布局和草稿修改不改变运行', async () => {
  let entered!: () => void, release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let calls = 0;
  const t = await setup(async (c) => {
    calls++;
    await c.onActivity({
      id: 'external',
      toolCallId: 'same-tool-id',
      toolName: 'inspect_material',
      status: 'running',
    });
    if (calls === 1) {
      entered();
      await gate;
    }
    await c.onActivity({
      id: 'external',
      toolCallId: 'same-tool-id',
      toolName: 'inspect_material',
      status: 'completed',
      result: 'ok',
    });
    return {
      task: c.node.task!,
      values: Object.values(c.inputs)
        .flat()
        .map((i) => i.value),
    };
  });
  try {
    const frozen = structuredClone(t.inputs);
    const id = await t.runs.start(t.work.id, {
      definitionId: t.id,
      scope: 'full',
      inputs: t.inputs,
    });
    await ready;
    t.inputs.materials.splice(1);
    const newDefinition = structuredClone(base);
    newDefinition.nodes[0].task = 'new';
    await t.flow.saveDraft(t.work.id, t.id, newDefinition);
    release();
    await t.runs.wait(id);
    const run = (await t.files.read(t.work.id)).runs[0];
    assert.equal(run.definitionId, t.id);
    assert.deepEqual(run.inputs, frozen);
    assert.equal(calls, 4);
    const ids = run.results.map((r) => r.activities[0].id);
    assert.equal(new Set(ids).size, 4);
    assert.equal(run.results[0].activities.length, 1);
    assert.equal(run.results[0].activities[0].status, 'completed');
    assert.equal(
      (run.results[0].outputs.output[0].value as { task: string }).task,
      'classify',
    );
  } finally {
    await t.cleanup();
  }
});
