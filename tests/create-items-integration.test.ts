import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index.ts';
import type {
  CandidateSource,
  Definition,
  Json,
} from '../src/shared/records.ts';
const definition: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  nodes: [
    {
      id: 'create',
      kind: 'create-items',

      operation: 'aggregate',
      label: '建立子项',
    },
  ],
  edges: [{ from: ['$input', 'input'], to: ['create', 'input'] }],
  outputs: { output: ['create', 'output'] },
};
test('真实HTTP/runtime/业务文件：部分建立失败保留A；同源补建B不重跑上游，旧Run保持失败', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'create-items-integration-'));
  const app = await createApplication({
    dataRoot: root,
    executeNode: async () => {
      throw Error('不调用模型');
    },
  });
  t.after(async () => {
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });
  const candidates = [
    {
      id: 'A',
      title: '导出异常',
      goal: '查明导出问题',
      inputs: [{ label: '反馈', value: { error: '导出失败' } }],
    },
    {
      id: 'B',
      title: '搜索异常',
      inputs: [{ label: '反馈', value: { error: '搜索不到' } }],
    },
  ];
  const parent = await app.items.create({
    title: '反馈调查',
    goal: '解决独立问题',
    materials: [],
    receivedInputs: [{ label: '候选', value: candidates as Json }],
  });
  const work = await app.files.read(parent.workId),
    definitionId = await app.flow.saveDraft(work.id, undefined, definition);
  await app.composition.bindInputs(parent.id, parent.revision, {
    input: [{ kind: 'received', inputId: parent.receivedInputs![0].id }],
  });
  const response = await app.app.request(`/api/items/${parent.id}/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'run',
      baseRevision: (await app.items.get(parent.id)).revision,
      definitionId,
      inputBindings: {
        input: [{ kind: 'received', inputId: parent.receivedInputs![0].id }],
      },
    }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const launched = await response.json(),
    runId = launched.runs.at(-1).runId;
  await app.runs.wait(runId);
  const run = (await app.files.read(work.id)).runs.find((r) => r.id === runId)!;
  assert.equal(run.status, 'failed');
  const result = run.results[0];
  const source: CandidateSource = {
    kind: 'node-input',
    workId: work.id,
    runId,
    resultId: result.id,
    port: 'input',
    index: 0,
  };
  const state = await app.items.candidates(parent.id, source);
  assert.deepEqual(
    state.receipts.map((r) => r.status),
    ['created', 'needs-input'],
  );
  const originalA = state.receipts[0].childId;
  const fixed = await app.items.createChildren(parent.id, {
    source,
    edits: [{ ...candidates[1], goal: '查明搜索问题' }],
  });
  assert.deepEqual(
    fixed.receipts.map((r) => r.status),
    ['linked', 'created'],
  );
  assert.equal(fixed.receipts[0].childId, originalA);
  const children = (await app.items.list()).items.filter(
    (i) => i.parentId === parent.id,
  );
  assert.equal(children.length, 2);
  assert.deepEqual((await app.items.get(originalA!)).receivedInputs![0].value, {
    error: '导出失败',
  });
  assert.equal(
    (await app.files.read(work.id)).runs.find((r) => r.id === runId)!.status,
    'failed',
  );
  const again = await app.items.createChildren(parent.id, { source });
  assert.equal(again.receipts[1].childId, fixed.receipts[1].childId);
  // Same-run recovery identifies the same candidate source and reuses established children.
  await app.files.change(work.id, (w) => {
    const r = w.runs.find((r) => r.id === runId)!;
    r.status = 'interrupted';
    r.nodeStates.create = 'interrupted';
    r.results[0].status = 'interrupted';
  });
  await app.runs.resume(work.id, runId);
  await app.runs.wait(runId);
  const recovered = (await app.files.read(work.id)).runs.find(
    (r) => r.id === runId,
  )!;
  assert.equal(recovered.status, 'completed');
  assert.equal(recovered.results.length, 1);
  assert.equal(recovered.results[0].id, result.id);
  assert.equal(
    (await app.items.list()).items.filter((i) => i.parentId === parent.id)
      .length,
    2,
  );
});
