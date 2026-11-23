import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../src/server/index.ts';
import { withinStageScope } from '../src/server/work-items/source-scope.ts';
import type { Definition, WorkItem } from '../src/shared/records.ts';

const identity: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  nodes: [
    {
      id: 'copy',
      label: '保留原值',
      kind: 'function',

      operation: 'map',
      functionName: 'identity',
    },
  ],
  edges: [{ from: ['$input', 'input'], to: ['copy', 'input'] }],
  outputs: { records: ['copy', 'output'] },
};

test('explicit descendant stage sources keep fixed provenance and reject excluded ancestors and other roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'descendant-sources-'));
  const app = await createApplication({ dataRoot: root });
  const post = async (id: string, body: unknown) => {
    const response = await app.app.request(
      `/api/items/${id}/workspace/actions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    return { ok: response.ok, value: (await response.json()) as any };
  };
  try {
    const method = await app.work.createWork('测试方法', []);
    await app.flow.saveDraft(method.id, undefined, identity);
    const parent = await app.items.create({
      title: '根',
      goal: '组合成果',
      materials: [],
    });
    const group = await app.items.create({
      parentId: parent.id,
      title: '分组',
      goal: '归属',
      materials: [],
    });
    const leaf = await app.items.create({
      parentId: group.id,
      title: '研究项',
      goal: '测试',
      materials: ['original fixture'],
    });
    const outside = await app.items.create({
      title: '其他根',
      goal: '范围',
      materials: [],
    });
    const leafWork = await app.files.read(leaf.workId);
    await app.flow.saveDraft(leaf.workId, leafWork.draftId, identity);
    await app.composition.bindInputs(leaf.id, leaf.revision, {
      input: leaf.materials.map((m) => ({
        kind: 'material',
        materialId: m.id,
      })),
    });
    await app.execution.runItem(leaf.id, {
      baseRevision: (await app.items.get(leaf.id)).revision,
    });
    for (
      let i = 0;
      i < 100 &&
      (await app.items.get(leaf.id)).execution?.status !== 'completed';
      i++
    )
      await delay(20);
    assert.equal((await app.items.get(leaf.id)).execution?.status, 'completed');
    const direct = await post(parent.id, { action: 'childOutputs' });
    assert.equal(direct.value.total, 0);
    const descendants = await post(parent.id, {
      action: 'childOutputs',
      scope: 'descendants',
    });
    assert.equal(descendants.value.total, 1);
    const source = descendants.value.outputs[0].source;
    const selection = {
      kind: 'child-results',
      scope: 'descendants',
      itemId: leaf.id,
      sources: [source],
    };
    const preview = await post(parent.id, {
      action: 'previewChildOutput',
      selection,
    });
    assert.equal(preview.ok, true);
    assert.deepEqual(preview.value.value.outputs[0].source, source);
    const wrongScope = await post(parent.id, {
      action: 'previewChildOutput',
      selection: { ...selection, scope: 'children' },
    });
    assert.equal(wrongScope.ok, false);
    assert.equal(
      (await post(outside.id, { action: 'previewChildOutput', selection })).ok,
      false,
    );
    await post(parent.id, { action: 'init' });
    let parentView = await app.items.get(parent.id);
    let workspace = (
      await post(parent.id, {
        action: 'saveFlow',
        baseRevision: parentView.revision,
        definition: identity,
      })
    ).value;
    const bound = await post(parent.id, {
      action: 'selectChildOutputs',
      baseRevision: workspace.item.revision,
      inputPort: 'input',
      selections: [selection],
    });
    assert.equal(bound.ok, true);
    const scope = await post(parent.id, {
      action: 'itemScope',
      page: 1,
      pageSize: 10,
    });
    assert.equal(scope.ok, true);
    assert.equal(scope.value.items.length, 2);
    assert.equal(
      scope.value.items.find((i: any) => i.id === leaf.id).execution.status,
      'completed',
    );
    const queued = await app.items.create({
      parentId: group.id,
      title: '已排队',
      goal: '不要重复派发',
      materials: ['queue fixture'],
    });
    const prepared = await app.composition.useMethod(
      queued.id,
      queued.revision,
      method.id,
      (await app.files.read(method.id)).draftId!,
      undefined,
      { input: [{ kind: 'material', materialId: queued.materials[0]!.id }] },
    );
    const batch = await app.batches.create({
      parentId: group.id,
      title: '已有队列',
      entries: [
        {
          itemId: queued.id,
          selection: {
            baseRevision: prepared.item.revision,
            definitionId: prepared.work!.work.draftId!,
            scope: 'full',
            inputBindings: prepared.item.inputBindings,
          },
        },
      ],
    });
    await app.batches.action(batch.id, 'pause');
    const queuedScope = await post(parent.id, { action: 'itemScope' });
    assert.equal(queuedScope.value.batches[0].id, batch.id);
    assert.deepEqual(
      queuedScope.value.items.find((i: any) => i.id === queued.id).queues,
      [{ batchId: batch.id, status: 'pending' }],
    );
    assert.equal(
      (await post(parent.id, { action: 'childOutputs', scope: 'unknown' })).ok,
      false,
    );
    const oldRun = JSON.stringify((await app.files.read(method.id)).runs);
    await app.items.scope(group.id, 'excluded', 'fixture excluded ancestor');
    assert.equal(
      (await post(parent.id, { action: 'previewChildOutput', selection })).ok,
      false,
    );
    assert.equal(
      (await post(parent.id, { action: 'checkWorkspace' })).value.canExecute,
      false,
    );
    assert.equal(
      (await post(parent.id, { action: 'childOutputs', scope: 'descendants' }))
        .value.total,
      0,
    );
    assert.equal(
      JSON.stringify((await app.files.read(method.id)).runs),
      oldRun,
    );
  } finally {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('descendant stage membership rejects cycles and requires explicit scope', async () => {
  const a = { id: 'a', parentId: 'b' } as WorkItem;
  const b = { id: 'b', parentId: 'a' } as WorkItem;
  const read = async (id: string) => (id === 'a' ? a : b);
  assert.equal(await withinStageScope('root', a, read, 'descendants'), false);
  const leaf = { id: 'leaf', parentId: 'group' } as WorkItem;
  const group = { id: 'group', parentId: 'root' } as WorkItem;
  assert.equal(await withinStageScope('root', leaf, async () => group), false);
  assert.equal(
    await withinStageScope('root', leaf, async () => group, 'descendants'),
    true,
  );
});
