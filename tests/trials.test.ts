import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index.ts';
import { createFlow } from '../src/server/flow/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createRuns } from '../src/server/runs/index.ts';
import { createTrials } from '../src/server/trials/index.ts';
import type {
  Definition,
  Inputs,
  Json,
  NodeExecution,
} from '../src/shared/records.ts';
const d: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [{ id: 'a', kind: 'agent', mode: 'each', label: '分类', task: '旧' }],
  edges: [{ from: ['$input', 'materials'], to: ['a', 'input'] }],
  outputs: { out: ['a', 'output'] },
};
async function setup(execute: (c: NodeExecution) => Promise<Json>) {
  const dir = await mkdtemp(join(tmpdir(), 'dynamic-trial-'));
  const files = createFiles(dir),
    flow = createFlow(files),
    w = await createWorkService(files).createWork('比较', ['F1', 'F2', 'F3']);
  const baselineId = await flow.saveDraft(w.id, undefined, d);
  await flow.adopt(w.id, baselineId);
  const candidateId = await flow.saveDraft(w.id, baselineId, {
    ...d,
    nodes: [{ ...d.nodes[0], task: '新' }],
  });
  const runs = createRuns(files, execute),
    trials = createTrials(files, runs);
  const inputs: Inputs = {
    input: [w.materials[0], w.materials[2]].map((m) => ({
      sampleId: m.id,
      value: m.text,
      materialIds: [m.id],
      sourceResultIds: [],
    })),
  };
  return { dir, files, flow, w, baselineId, candidateId, runs, trials, inputs };
}
test('比较两侧固定同样本，基线失败仍执行候选且保存真实状态', async () => {
  const seen: string[] = [];
  const t = await setup(async (c) => {
    seen.push(c.node.task + ':' + c.inputs.input[0].value);
    if (c.node.task === '旧') throw Error('基线失败');
    return '新结果';
  });
  try {
    const id = await t.trials.compare(t.w.id, {
      candidateId: t.candidateId,
      nodeId: 'a',
      inputs: t.inputs,
    });
    await t.trials.wait(id);
    const w = await t.files.read(t.w.id);
    assert.deepEqual(seen, ['旧:F1', '旧:F3', '新:F1', '新:F3']);
    assert.deepEqual(w.runs[0].inputs, w.runs[1].inputs);
    assert.equal(w.runs[0].status, 'failed');
    assert.equal(w.runs[1].status, 'completed');
    assert.equal(w.comparisons[0].status, 'completed');
    assert.equal(w.comparisons[0].baselineId, t.baselineId);
  } finally {
    await rm(t.dir, { recursive: true, force: true });
  }
});
test('取消比较不启动候选，重复点击不能创建第二条执行链', async () => {
  let started!: () => void, finish!: (j: Json) => void;
  const ready = new Promise<void>((r) => (started = r));
  const t = await setup(async () => {
    started();
    return new Promise<Json>((r) => (finish = r));
  });
  try {
    const id = await t.trials.compare(t.w.id, {
      candidateId: t.candidateId,
      nodeId: 'a',
      inputs: t.inputs,
    });
    await ready;
    await assert.rejects(
      t.trials.compare(t.w.id, {
        candidateId: t.candidateId,
        nodeId: 'a',
        inputs: t.inputs,
      }),
      /运行/,
    );
    await t.trials.stopComparison(t.w.id, id);
    finish('late');
    await t.trials.wait(id);
    const w = await t.files.read(t.w.id);
    assert.equal(w.comparisons[0].status, 'cancelled');
    assert.equal(w.runs.length, 1);
    assert.equal(w.runs[0].status, 'cancelled');
  } finally {
    await rm(t.dir, { recursive: true, force: true });
  }
});
