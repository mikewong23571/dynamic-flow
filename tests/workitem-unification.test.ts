import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFiles } from '../src/server/files/index.ts';
import { createWorkItems } from '../src/server/work-items/index.ts';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'item-unification-'));
  const files = createFiles(root);
  const items = createWorkItems(root, files);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { files, items };
}

test('a business item starts with one private method workspace and one input binding', async (t) => {
  const { files, items } = await fixture(t);
  const item = await items.create({
    title: '来件处理',
    goal: '整理真实来件',
    materials: ['来件A'],
  });
  assert.ok(item.workId);
  const work = await files.read(item.workId);
  assert.equal(work.ownerItemId, item.id);
  assert.deepEqual(item.inputBindings, {});
  assert.deepEqual(item.deliveries, []);
  assert.equal('workflowId' in item, false);
  assert.equal('lastRunSelection' in item, false);
});

test('an invalid child never reopens a completed parent or clears its evidence', async (t) => {
  const { items } = await fixture(t);
  const parent = await items.create({
    title: '父项',
    goal: '确认范围',
    materials: [],
    criteria: ['已核对范围'],
  });
  await items.criteria(
    parent.id,
    parent.criteria.map((c) => ({
      ...c,
      met: true,
      evidence: '人工已核对范围',
    })),
  );
  await items.complete(parent.id);
  const before = await items.get(parent.id);
  await assert.rejects(
    () =>
      items.create({
        title: '',
        goal: '无效子项',
        materials: [],
        parentId: parent.id,
        confirmReopen: true,
      }),
    /标题/,
  );
  const after = await items.get(parent.id);
  assert.equal(after.status, 'completed');
  assert.deepEqual(after.criteria, before.criteria);
  assert.deepEqual(after.history, before.history);
});

import { createApplication } from '../src/server/index.ts';
import type {
  Definition,
  ItemInputSelection,
  ItemRunRef,
  Json,
} from '../src/shared/records.ts';
import type { ItemWorkspace } from '../src/shared/workitem-composition.ts';

async function application(
  t: test.TestContext,
  executeNode?: NonNullable<
    Parameters<typeof createApplication>[0]
  >['executeNode'],
) {
  const root = await mkdtemp(join(tmpdir(), 'item-unification-http-'));
  const app = await createApplication({
    dataRoot: root,
    ...(executeNode ? { executeNode } : {}),
  });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });
  const item = await app.items.create({
    title: '真实工作',
    goal: '处理并核对真实记录',
    materials: [],
  });
  async function command(
    action: string,
    fields: Record<string, unknown> = {},
    status = 200,
  ): Promise<ItemWorkspace> {
    const current = await app.items.get(item.id);
    const response = await app.app.request(
      `/api/items/${item.id}/workspace/actions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          baseRevision: current.revision,
          ...fields,
        }),
      },
    );
    const body = await response.json();
    assert.equal(response.status, status, JSON.stringify(body));
    return body as ItemWorkspace;
  }
  const workspace = () => app.composition.snapshot(item.id);
  return { app, item, command, workspace };
}
const recordsProgram = (rowKey = 'id', title = '真实记录') =>
  `root = Workspace("工作成果", [records])\nrecords = Records("rows", "${title}", "${rowKey}", [Field("id", "编号"), Field("x", "结果")])`;
const identityDefinition: Definition = {
  schemaVersion: 1,
  inputs: ['data'],
  nodes: [
    {
      id: 'identity',
      label: '保留原始记录',
      kind: 'function',
      functionName: 'identity',
      operation: 'aggregate',
    },
  ],
  edges: [{ from: ['$input', 'data'], to: ['identity', 'input'] }],
  outputs: { rows: ['identity', 'output'] },
};

test('manual revisions, workspace execution and native OpenUI publication share one fixed input and record contract', async (t) => {
  const { app, item, command, workspace } = await application(t);
  let ws = await command('saveFlow', { definition: identityDefinition });
  const definitionId = ws.work!.work.draftId!;
  ws = await command('addInput', {
    inputPort: 'data',
    label: '业务记录',
    value: { id: 'R1', alternate: 'A1', x: 1 },
  });
  const oldInputId = ws.item.receivedInputs![0].id;
  const revised = await app.app.request(`/api/items/${item.id}/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'reviseInput',
      baseRevision: ws.item.revision,
      inputId: oldInputId,
      value: { id: 'R1', alternate: 'A1', x: 2 },
    }),
  });
  assert.equal(revised.status, 200, await revised.clone().text());
  ws = await command('run');
  const ref = ws.item.runs.at(-1)!;
  await app.runs.wait(ref.runId);
  const run = (await app.files.read(ref.workId)).runs.find(
    (r) => r.id === ref.runId,
  )!;
  assert.equal(run.status, 'completed');
  assert.deepEqual(run.inputs.data[0].value, {
    id: 'R1',
    alternate: 'A1',
    x: 2,
  });
  assert.deepEqual(
    (await workspace()).item.receivedInputs!.find((i) => i.id === oldInputId)!
      .value,
    { id: 'R1', alternate: 'A1', x: 1 },
  );
  ws = await command('saveUiProgram', {
    source: recordsProgram(),
    definitionId,
  });
  ws = await command('publishDelivery', {
    runId: ref.runId,
    output: 'rows',
    programId: ws.uiProgram!.id,
  });
  const delivery = ws.deliveries[0];
  assert.equal(delivery.recordContract!.rowKey, 'id');
  ws = await command('saveUiProgram', {
    source: recordsProgram('id', '改个标签'),
    expectedProgramId: ws.uiProgram!.id,
  });
  assert.equal(ws.deliveries[0].id, delivery.id);
  ws = await command('saveUiProgram', {
    source: recordsProgram('alternate'),
    expectedProgramId: ws.uiProgram!.id,
  });
  assert.notEqual(ws.deliveries[0].id, delivery.id);
  assert.equal(ws.deliveries[0].recordContract!.rowKey, 'alternate');
  const publicMethod = await app.work.createWork('下一段', []),
    publicVersion = await app.flow.saveDraft(
      publicMethod.id,
      undefined,
      identityDefinition,
    );
  const before = await workspace();
  await command(
    'continueRecords',
    {
      deliveryId: ws.deliveries[0].id,
      recordIds: ['does-not-exist'],
      methodId: publicMethod.id,
      methodDefinitionId: publicVersion,
    },
    400,
  );
  const after = await workspace();
  assert.equal(after.item.revision, before.item.revision);
  assert.equal(after.work!.work.draftId, before.work!.work.draftId);
});

test('a failed nested instance continues in a new commit run, then explicit old/new sources publish the whole set', async (t) => {
  const calls = new Map<string, number>();
  const { app, item, command, workspace } = await application(
    t,
    async (context) => {
      const value = Object.values(context.inputs).flat()[0].value as {
        id: string;
        x: number;
      };
      calls.set(value.id, (calls.get(value.id) ?? 0) + 1);
      if (value.id === 'R2' && calls.get(value.id) === 1)
        throw Error('明确的首次失败fixture');
      return { id: value.id, x: value.x + 1 };
    },
  );
  const method = await app.work.createWork('逐条处理', []);
  const publicDefinition: Definition = {
    schemaVersion: 1,
    inputs: ['data'],
    nodes: [
      {
        id: 'process',
        label: '逐条真实处理',
        kind: 'agent',
        operation: 'map',
        task: 'Explicit test fixture processes each record.',
      },
      {
        id: 'finish',
        label: '汇总真实记录',
        kind: 'function',
        functionName: 'identity',
        operation: 'aggregate',
      },
    ],
    edges: [
      { from: ['$input', 'data'], to: ['process', 'input'] },
      { from: ['process', 'output'], to: ['finish', 'input'] },
    ],
    outputs: { rows: ['finish', 'output'] },
  };
  const version = await app.flow.saveDraft(
    method.id,
    undefined,
    publicDefinition,
  );
  await command('useMethod', { methodId: method.id, definitionId: version });
  for (const [index, id] of ['R1', 'R2', 'R3'].entries())
    await command('addInput', {
      inputPort: 'data',
      label: id,
      value: { id, x: index },
    });
  let ws = await command('run');
  const original = ws.item.runs.at(-1)!;
  await app.runs.wait(original.runId);
  const rootRun = (await app.files.read(original.workId)).runs.find(
    (r) => r.id === original.runId,
  )!;
  assert.equal(rootRun.status, 'failed');
  const childRef = rootRun.results.find((r) => r.call)!.call!;
  const child = (await app.files.read(childRef.workId)).runs.find(
    (r) => r.id === childRef.runId,
  )!;
  const failed = child.results.filter((r) => r.status === 'failed');
  assert.equal(failed.length, 1);
  ws = await command('continueFailedInputs', {
    workId: childRef.workId,
    runId: childRef.runId,
    resultIds: failed.map((r) => r.id),
  });
  const retried = ws.item.runs.at(-1)!;
  assert.notEqual(retried.runId, original.runId);
  await app.runs.wait(retried.runId);
  const retry = (await app.files.read(retried.workId)).runs.find(
    (r) => r.id === retried.runId,
  )!;
  assert.equal(retry.status, 'completed');
  assert.equal(retry.effectMode, 'commit');
  assert.equal(retry.retrySource?.workId, childRef.workId);
  assert.equal(
    retry.inputs.input[0].sampleId,
    failed[0].input.input[0].sampleId,
  );
  assert.equal(retry.inputs.input[0].inputSource?.resultId, failed[0].id);
  assert.deepEqual(Object.fromEntries(calls), { R1: 1, R2: 2, R3: 1 });
  assert.equal(
    (await app.files.read(original.workId)).runs.find(
      (r) => r.id === original.runId,
    )!.status,
    'failed',
  );
  const merge: Definition = {
    schemaVersion: 1,
    inputs: ['old', 'new'],
    nodes: [
      {
        id: 'merge',
        label: '明确汇合成功成果',
        kind: 'function',
        functionName: 'merge',
        inputNames: ['old', 'new'],
      },
    ],
    edges: [
      { from: ['$input', 'old'], to: ['merge', 'old'] },
      { from: ['$input', 'new'], to: ['merge', 'new'] },
    ],
    outputs: { rows: ['merge', 'output'] },
  };
  ws = await workspace();
  ws = await command('saveFlow', {
    expectedDraftId: ws.work!.work.draftId,
    definition: merge,
  });
  const source = (ref: ItemRunRef, resultId: string): ItemInputSelection => ({
    kind: 'result',
    source: {
      workId: ref.workId,
      runId: ref.runId,
      resultId,
      port: 'output',
      index: 0,
    },
  });
  const inputBindings = {
    old: child.results
      .filter((r) => r.nodeId === 'process' && r.status === 'completed')
      .map((r) => source(childRef, r.id)),
    new: retry.results
      .filter((r) => r.status === 'completed')
      .map((r) => source(retried, r.id)),
  };
  await command('bindInputs', { inputBindings });
  ws = await command('run');
  const merged = ws.item.runs.at(-1)!;
  await app.runs.wait(merged.runId);
  ws = await workspace();
  ws = await command('saveUiProgram', {
    source: recordsProgram(),
    definitionId: ws.work!.work.draftId,
  });
  ws = await command('publishDelivery', {
    runId: merged.runId,
    output: 'rows',
    programId: ws.uiProgram!.id,
  });
  assert.deepEqual(
    ws.deliveries[0].rows!.map((row) => (row as { id: string }).id).sort(),
    ['R1', 'R2', 'R3'],
  );
  assert.equal(ws.item.status, 'open');
  assert.deepEqual(Object.fromEntries(calls), { R1: 1, R2: 2, R3: 1 });
});

test('creating a child from a projected process result rereads the exact frozen value and materials', async (t) => {
  const { app, item, command } = await application(t);
  const original = { id: 'R-large', evidence: '真实依据'.repeat(30_000) };
  const material = await app.items.addEvidence(item.id, ['该项专属原始材料']);
  const definition = structuredClone(identityDefinition);
  definition.nodes[0].operation = 'map';
  await command('saveFlow', { definition });
  await command('addInput', {
    inputPort: 'data',
    label: '大记录',
    value: original,
    materialIds: [material.materials[0].id],
  });
  const launched = await command('run');
  const ref = launched.item.runs.at(-1)!;
  await app.runs.wait(ref.runId);
  const run = (await app.files.read(ref.workId)).runs.find(
    (r) => r.id === ref.runId,
  )!;
  const fixed = structuredClone(run);
  const source = {
    workId: ref.workId,
    runId: ref.runId,
    resultId: run.results[0].id,
    port: 'output',
    index: 0,
  };
  const response = await app.app.request('/api/items', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      parentId: item.id,
      title: '核对该条记录',
      goal: '独立推进核对',
      receivedInputs: [{ label: '过程区所选记录', source, value: null }],
    }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  const child = await app.items.get((await response.json()).id);
  assert.deepEqual(child.receivedInputs![0].value, original);
  assert.deepEqual(child.receivedInputs![0].source, source);
  assert.deepEqual(
    child.receivedInputs![0].materials,
    run.results[0].outputs.output[0].materialIds.map((id) =>
      run.materials.find((m) => m.id === id),
    ),
  );
  assert.deepEqual(
    (await app.files.read(ref.workId)).runs.find((r) => r.id === ref.runId),
    fixed,
  );
});

test('manual input replacement rejects missing or stale revisions before changing its value or binding', async (t) => {
  const { app, item, command } = await application(t);
  await command('saveFlow', { definition: identityDefinition });
  await command('addInput', {
    inputPort: 'data',
    label: '当前输入',
    value: { id: 'R1', x: 1 },
  });
  const before = await app.items.get(item.id);
  for (const [baseRevision, code] of [
    [undefined, 'REVISION_REQUIRED'],
    [before.revision - 1, 'REVISION_CONFLICT'],
  ] as const) {
    const response = await app.app.request(`/api/items/${item.id}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'reviseInput',
        baseRevision,
        inputId: before.receivedInputs![0].id,
        value: { id: 'R1', x: 2 },
      }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, code);
    assert.deepEqual(await app.items.get(item.id), before);
  }
});

test('input replacement serializes with other writes to the same business item', async (t) => {
  const { app, item, command } = await application(t);
  await command('saveFlow', { definition: identityDefinition });
  await command('addInput', {
    inputPort: 'data',
    label: '当前输入',
    value: { id: 'R1', x: 1 },
  });
  const before = await app.items.get(item.id);
  const originalRead = app.files.readDefinition;
  let entered!: () => void, release!: () => void;
  const inside = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  app.files.readDefinition = async (...args) => {
    if (first) {
      first = false;
      entered();
      await gate;
    }
    return originalRead(...args);
  };
  t.after(() => {
    release();
    app.files.readDefinition = originalRead;
  });
  const replacement = app.items.reviseInput(item.id, {
    expectedRevision: before.revision,
    inputId: before.receivedInputs![0].id,
    value: { id: 'R1', x: 2 },
  });
  await inside;
  const concurrent = app.items.addEvidence(
    item.id,
    ['并发新增'],
    before.revision,
  );
  const timer = setTimeout(release, 20);
  const results = await Promise.allSettled([replacement, concurrent]);
  clearTimeout(timer);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  if (results[1].status === 'rejected')
    assert.equal(results[1].reason.code, 'REVISION_CONFLICT');
  const after = await app.items.get(item.id);
  assert.equal(after.revision, before.revision + 1);
  assert.deepEqual(after.materials, before.materials);
  assert.deepEqual(after.receivedInputs!.at(-1)!.value, { id: 'R1', x: 2 });
});
