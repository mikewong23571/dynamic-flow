import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index';
import { createWorkItems } from '../src/server/work-items/index';
import { createApplication } from '../src/server/index';
import type { WorkItemSummaryPage } from '../src/shared/records';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'flowcraft-root-list-'));
  const items = createWorkItems(root, createFiles(root));
  const parent = await items.create({
    title: '季度核对',
    goal: '完整业务目标',
    materials: [],
  });
  const independent = await items.create({
    title: '独立跟进',
    goal: '另一完整目标',
    materials: [],
  });
  const completed = await items.create({
    title: '已验收事项',
    goal: '已完成目标',
    materials: [],
    criteria: ['已验收'],
  });
  await items.criteria(
    completed.id,
    completed.criteria.map((c) => ({
      ...c,
      met: true,
      evidence: '明确验收依据',
    })),
  );
  await items.complete(completed.id);
  const { receipts } = await items.createChildren(parent.id, {
    candidates: [
      {
        id: 'a',
        title: '仅子项关键字',
        goal: '独立推进的子任务',
        inputs: [],
        criteria: ['已确认'],
      },
      {
        id: 'b',
        title: '已完成子任务',
        goal: '确认该范围',
        inputs: [],
        criteria: ['已确认'],
      },
      { id: 'c', title: '排除的子任务', goal: '排除该范围', inputs: [] },
    ],
  });
  const [child, done, excluded] = await Promise.all(
    receipts.map((r) => items.get(r.childId!)),
  );
  await items.criteria(
    done.id,
    done.criteria.map((c) => ({ ...c, met: true, evidence: '子任务已验收' })),
  );
  await items.complete(done.id);
  await items.scope(excluded.id, 'excluded', '当前范围外');
  const nested = await items.createChildren(child.id, {
    candidates: [
      { id: 'grand', title: '孙项关键字', goal: '进一步拆分', inputs: [] },
    ],
  });
  return {
    root,
    items,
    parent,
    independent,
    completed,
    child,
    done,
    excluded,
    grandId: nested.receipts[0].childId!,
  };
}

test('顶层范围在搜索/状态/分页前收敛，数量及子项进度一致', async () => {
  const f = await fixture();
  try {
    const first = await f.items.summaries({
      view: 'roots',
      page: 1,
      pageSize: 2,
    });
    const second = await f.items.summaries({
      view: 'roots',
      page: 2,
      pageSize: 2,
    });
    assert.equal(first.total, 3);
    assert.equal(first.summary.total, 3);
    assert.equal(first.scopeSummary.total, 3);
    assert.equal(first.summary.pending, 2);
    assert.equal(first.summary.completed, 1);
    assert.equal(first.items.length, 2);
    assert.equal(second.items.length, 1);
    const rows = [...first.items, ...second.items];
    assert.deepEqual(
      new Set(rows.map((i) => i.id)),
      new Set([f.parent.id, f.independent.id, f.completed.id]),
    );
    assert.ok(rows.every((i) => !i.parentId));
    const parent = rows.find((i) => i.id === f.parent.id)!;
    assert.equal(parent.childCount, 2);
    assert.equal(parent.completedChildCount, 1);
    const search = await f.items.summaries({
      view: 'roots',
      query: '仅子项关键字',
    });
    assert.equal(search.total, 0);
    assert.equal(search.summary.total, 3);
    assert.equal(search.scopeSummary.total, 3);
    const pending = await f.items.summaries({
      view: 'roots',
      status: 'pending',
      pageSize: 1,
    });
    assert.equal(pending.total, 2);
    assert.equal(pending.items.length, 1);
    assert.equal(pending.summary.completed, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('根列表查询不污染子项范围、精确ids和旧无范围查询', async () => {
  const f = await fixture();
  try {
    await f.items.summaries({ view: 'roots' });
    const children = await f.items.summaries({ parentId: f.parent.id });
    assert.deepEqual(
      new Set(children.items.map((i) => i.id)),
      new Set([f.child.id, f.done.id]),
    );
    const descendants = await f.items.summaries({
      rootId: f.parent.id,
      view: 'all',
    });
    assert.deepEqual(
      new Set(descendants.items.map((i) => i.id)),
      new Set([f.child.id, f.done.id, f.grandId]),
    );
    const precise = await f.items.summaries({
      ids: [f.excluded.id, f.grandId],
      pageSize: 1,
    });
    assert.equal(precise.items.length, 2);
    assert.equal(precise.total, 2);
    assert.equal((await f.items.get(f.child.id)).parentId, f.parent.id);
    assert.equal((await f.items.summaries()).total, 7);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('HTTP roots范围保留完整子项读取入口', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flowcraft-root-http-'));
  const app = await createApplication({ dataRoot: root });
  try {
    const parent = await app.items.create({
      title: '主事项',
      goal: '整体目标',
      materials: [],
    });
    const children = await app.items.createChildren(parent.id, {
      candidates: [{ id: 'a', title: '子项', goal: '局部目标', inputs: [] }],
    });
    const read = async (path: string) =>
      (await (await app.app.request(path)).json()) as WorkItemSummaryPage;
    const page = await read('/api/items?summary=true&view=roots&pageSize=1');
    assert.equal(page.total, 1);
    assert.equal(page.summary.total, 1);
    assert.equal(page.items[0].id, parent.id);
    const childId = children.receipts[0].childId!;
    assert.equal(
      (await read(`/api/items?summary=true&parentId=${parent.id}`)).items[0].id,
      childId,
    );
    assert.equal(
      (await read(`/api/items?summary=true&ids=${childId}`)).items[0].id,
      childId,
    );
    assert.equal((await app.app.request(`/api/items/${childId}`)).status, 200);
  } finally {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  }
});
