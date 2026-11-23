import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index';
import type { Definition } from '../src/shared/records';

export const stageDefinition: Definition = {
  schemaVersion: 1,
  inputs: ['data', 'supplement'],
  inputContracts: {
    supplement: {
      required: false,
      item: {
        type: 'object',
        properties: {
          value: { type: 'string', title: '补充说明' },
          recordId: { type: 'string', title: '记录编号' },
        },
        required: ['value', 'recordId'],
      },
    },
  },
  nodes: [
    {
      id: 'prepare',
      label: '整理待核对内容',
      kind: 'function',
      operation: 'map',
      functionName: 'identity',
    },
    {
      id: 'wait',
      label: '等待范围确认',
      kind: 'wait',
      wait: { event: 'scope.ready', reason: '请补充适用范围后继续核对' },
    },
  ],
  edges: [
    { from: ['$input', 'data'], to: ['prepare', 'input'] },
    { from: ['prepare', 'output'], to: ['wait', 'input'] },
  ],
  outputs: { stage: ['prepare', 'output'], final: ['wait', 'output'] },
};

test('stage observation reads actual output before publication, keeps explicit old run identity and rejects another item', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'flowcraft-visibility-'));
  const app = await createApplication({ dataRoot: root });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });
  const item = await app.items.create({
    title: '资料核对',
    goal: '核对范围',
    materials: [],
  });
  let ws = await app.composition.snapshot(item.id);
  ws = await app.composition.saveFlow(
    item.id,
    ws.item.revision,
    stageDefinition,
    ws.work!.work.draftId,
  );
  ws = await app.composition.addInput(
    item.id,
    ws.item.revision,
    'data',
    '实际资料',
    { id: 'D1', finding: '需要补充范围' },
  );
  assert.equal(
    (await app.composition.readOutput(item.id, { output: 'stage' })).run,
    null,
  );
  assert.deepEqual((await app.composition.readInputs(item.id, 'data')).rows, [
    { id: 'D1', finding: '需要补充范围' },
  ]);
  const response = await app.app.request(
    `/api/items/${item.id}/workspace/actions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'run', baseRevision: ws.item.revision }),
    },
  );
  assert.equal(response.status, 200, await response.text());
  for (let i = 0; i < 200; i++) {
    if ((await app.items.get(item.id)).execution?.status === 'waiting') break;
    await new Promise((r) => setTimeout(r, 10));
  }
  const current = await app.items.get(item.id);
  assert.equal(current.execution?.status, 'waiting');
  const observed = await app.composition.readOutput(item.id, {
    output: 'stage',
  });
  assert.equal(observed.run?.id, current.execution!.runId);
  assert.equal(observed.run?.status, 'waiting');
  assert.deepEqual(observed.rows, [{ id: 'D1', finding: '需要补充范围' }]);
  assert.equal(observed.sources[0].runId, current.execution!.runId);
  assert.deepEqual(current.deliveries, []);
  assert.deepEqual(
    (
      await app.composition.readOutput(item.id, {
        nodeId: 'prepare',
        port: 'output',
      })
    ).rows,
    observed.rows,
  );
  await assert.rejects(
    () =>
      app.composition.readOutput(item.id, {
        output: 'stage',
        nodeId: 'prepare',
        port: 'output',
      }),
    /不能同时/,
  );
  const other = await app.items.create({
    title: '另一项',
    goal: '独立业务',
    materials: [],
  });
  await assert.rejects(
    () =>
      app.composition.readOutput(other.id, {
        output: 'stage',
        runId: observed.run!.id,
      }),
    /不属于/,
  );
  await assert.rejects(
    () => app.composition.readOutput(item.id, { output: 'missing' }),
    /不存在/,
  );
  const frozen = structuredClone(await app.files.read(item.workId));
  await app.items.addEvidence(item.id, ['后补材料']);
  const old = await app.composition.readOutput(item.id, {
    output: 'stage',
    runId: observed.run!.id,
  });
  assert.deepEqual(old.rows, observed.rows);
  assert.deepEqual((await app.files.read(item.workId)).runs, frozen.runs);
  const latest = await app.items.get(item.id);
  await app.composition.addInput(
    item.id,
    latest.revision,
    'data',
    '修订资料',
    { id: 'D1', finding: '范围已补充' },
    latest.receivedInputs![0].id,
  );
  assert.deepEqual((await app.composition.readInputs(item.id, 'data')).rows, [
    { id: 'D1', finding: '范围已补充' },
  ]);
  assert.deepEqual(
    (
      await app.composition.readOutput(item.id, {
        output: 'stage',
        runId: observed.run!.id,
      })
    ).rows,
    observed.rows,
  );
  await assert.rejects(
    () => app.composition.readInputs(item.id, 'missing'),
    /不存在/,
  );
});
