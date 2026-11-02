import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../src/server/index.ts';
import type {
  Definition,
  WorkItemRunSelection,
} from '../src/shared/records.ts';

const definition: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  nodes: [
    {
      id: 'one',
      label: '处理',
      kind: 'agent',

      operation: 'map',
      task: '处理',
    },
  ],
  edges: [{ from: ['$input', 'input'], to: ['one', 'input'] }],
  outputs: { result: ['one', 'output'] },
};
async function post(
  app: Awaited<ReturnType<typeof createApplication>>['app'],
  path: string,
  body: unknown,
) {
  const r = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await r.json();
  assert.equal(r.ok, true, JSON.stringify(result));
  return result as any;
}
async function until(check: () => Promise<boolean>, timeout = 18000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(40);
  }
  throw Error('等待批次状态超时');
}

test(
  '批次通过正式工作项运行，限制并发，暂停与重启保留待启动项',
  { timeout: 35000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'item-batch-'));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let first: Awaited<ReturnType<typeof createApplication>> | undefined,
      second: Awaited<ReturnType<typeof createApplication>> | undefined;
    try {
      let calls = 0;
      first = await createApplication({
        dataRoot: root,
        executeNode: async () => {
          calls++;
          await gate;
          return 'done';
        },
      });
      const parent = await first.items.create({
        title: '父项',
        goal: '目标',
        materials: [],
      });
      const method = await first.work.createWork('处理方法', []);
      const definitionId = await first.flow.saveDraft(
        method.id,
        undefined,
        definition,
      );
      const created = await first.items.createChildren(parent.id, {
        candidates: [1, 2, 3].map((i) => ({
          id: String(i),
          title: `子项${i}`,
          goal: '处理',
          inputs: [{ label: '输入', value: `输入${i}` }],
        })),
      });
      const entries: { itemId: string; selection: WorkItemRunSelection }[] = [];
      for (const receipt of created.receipts) {
        const item = await first.items.get(receipt.childId!);
        const prepared = await first.composition.useMethod(
          item.id,
          item.revision,
          method.id,
          definitionId,
          undefined,
          {
            input: [{ kind: 'received', inputId: item.receivedInputs![0].id }],
          },
        );
        entries.push({
          itemId: item.id,
          selection: {
            baseRevision: prepared.item.revision,
            definitionId: prepared.work!.work.draftId!,
            scope: 'full',
            inputBindings: {
              input: [
                { kind: 'received', inputId: item.receivedInputs![0].id },
              ],
            },
          },
        });
      }
      const batch = await post(first.app, '/api/item-batches', {
        parentId: parent.id,
        title: '自动处理',
        concurrency: 2,
        entries,
      });
      await until(async () => calls === 2);
      assert.equal(
        first.batches
          .get(batch.id)
          .entries.filter((e) => e.status === 'pending').length,
        1,
      );
      await post(first.app, `/api/item-batches/${batch.id}/actions`, {
        action: 'pause',
      });
      first.batches.close();
      release();
      await until(async () =>
        (
          await Promise.all(
            entries.slice(0, 2).map((entry) => first!.items.get(entry.itemId)),
          )
        ).every((item) => item.execution?.status === 'completed'),
      );
      assert.equal(calls, 2);
      first.batches.close();
      first.runs.close();
      second = await createApplication({
        dataRoot: root,
        executeNode: async () => {
          calls++;
          return 'done';
        },
      });
      assert.equal(second.batches.get(batch.id).status, 'paused');
      await until(
        async () =>
          second!.batches
            .get(batch.id)
            .entries.filter((e) => e.status === 'completed').length === 2,
      );
      assert.equal(
        calls,
        2,
        'paused recovered batch observes in-flight completions without starting pending work',
      );
      assert.equal(
        second.batches
          .get(batch.id)
          .entries.filter((e) => e.status === 'pending').length,
        1,
      );
      await post(second.app, `/api/item-batches/${batch.id}/actions`, {
        action: 'resume',
      });
      await until(
        async () => second!.batches.get(batch.id).status === 'completed',
      );
      assert.equal(calls, 3);
      assert.equal(
        second.batches
          .get(batch.id)
          .entries.filter((e) => e.status === 'completed').length,
        3,
      );
    } finally {
      release();
      first?.batches.close();
      first?.runs.close();
      second?.batches.close();
      second?.runs.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  '连续失败暂停后续提交，失败与未启动状态均可检查',
  { timeout: 15000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'item-batch-fail-'));
    let app: Awaited<ReturnType<typeof createApplication>> | undefined;
    try {
      app = await createApplication({
        dataRoot: root,
        batchPollMs: 20,
        executeNode: async () => {
          throw Error('fixture endpoint unavailable');
        },
      });
      const parent = await app.items.create({
        title: '父项',
        goal: '目标',
        materials: [],
      });
      const work = await app.work.createWork('方法', []);
      const definitionId = await app.flow.saveDraft(
        work.id,
        undefined,
        definition,
      );
      const { receipts } = await app.items.createChildren(parent.id, {
        candidates: [1, 2, 3, 4, 5].map((i) => ({
          id: String(i),
          title: `子项${i}`,
          goal: '处理',
          inputs: [{ label: '输入', value: `输入${i}` }],
        })),
      });
      const entries: { itemId: string; selection: WorkItemRunSelection }[] = [];
      for (const receipt of receipts) {
        const item = await app.items.get(receipt.childId!);
        const prepared = await app.composition.useMethod(
          item.id,
          item.revision,
          work.id,
          definitionId,
          undefined,
          {
            input: [{ kind: 'received', inputId: item.receivedInputs![0].id }],
          },
        );
        entries.push({
          itemId: item.id,
          selection: {
            baseRevision: prepared.item.revision,
            definitionId: prepared.work!.work.draftId!,
            scope: 'full',
            inputBindings: {
              input: [
                { kind: 'received', inputId: item.receivedInputs![0].id },
              ],
            },
          },
        });
      }
      const batch = await post(app.app, '/api/item-batches', {
        parentId: parent.id,
        title: '失败处理',
        concurrency: 1,
        entries,
      });
      await until(async () => app!.batches.get(batch.id).status === 'paused');
      const result = app.batches.get(batch.id);
      assert.equal(
        result.entries.filter((e) => e.status === 'failed').length,
        3,
      );
      assert.equal(
        result.entries.filter((e) => e.status === 'pending').length,
        2,
      );
      assert.match(result.reason!, /三个/);
      assert.ok(
        result.entries
          .filter((e) => e.status === 'failed')
          .every((e) => e.error?.includes('fixture')),
      );
    } finally {
      app?.batches.close();
      app?.runs.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
