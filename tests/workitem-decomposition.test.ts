import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  rm,
  writeFile,
  mkdir,
  readFile,
  readdir,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createFiles } from '../src/server/files/index.ts';
import { createWorkItems } from '../src/server/work-items/index.ts';
import { createApplication } from '../src/server/index.ts';
import {
  createChildrenService,
  type ItemStorage,
} from '../src/server/work-items/children.ts';
import type {
  Definition,
  ItemPreparation,
  Json,
  NodeExecution,
  WorkItemView,
  CandidateSource,
  WorkItemSummaryPage,
  WorkItem,
  Run,
  Work,
  ItemInputSelection,
} from '../src/shared/records.ts';

test('拆分、结构性确认与祖先重开保持原完成依据', async () => {
  const root = await mkdtemp(join(tmpdir(), 'decomposition-'));
  try {
    const items = createWorkItems(root, createFiles(root));
    const parent = await items.create({
      title: '整体',
      goal: '解决问题',
      materials: [],
    });
    const { receipts } = await items.createChildren(parent.id, {
      candidates: [
        {
          id: 'a',
          title: 'A',
          goal: '确认A',
          criteria: ['已确认'],
          inputs: [{ label: '目标', value: { repository: 'A' } }],
        },
      ],
    });
    const child = await items.get(receipts[0].childId!);
    assert.equal(child.parentId, parent.id);
    await assert.rejects(() => items.complete(parent.id), /子项/);
    await items.criteria(
      child.id,
      child.criteria.map((c) => ({ ...c, met: true, evidence: '证据' })),
    );
    await items.complete(child.id);
    const done = await items.complete(parent.id);
    const original = done.history.at(-1)!.childCompletions;
    assert.equal(original?.[0].itemId, child.id);
    await assert.rejects(() => items.reopen(child.id, '补证'), /上级/);
    await items.reopen(child.id, '补证', true);
    assert.equal((await items.get(parent.id)).status, 'open');
    assert.deepEqual(
      (await items.get(parent.id)).history.find((h) => h.kind === 'completed')!
        .childCompletions,
      original,
    );
    const revised = await items.reviseInput(child.id, {
      expectedRevision: (await items.get(child.id)).revision,
      inputId: child.receivedInputs![0].id,
      value: { repository: 'A', ref: 'develop' },
    });
    assert.equal(revised.receivedInputs!.length, 2);
    assert.deepEqual(revised.receivedInputs![0].value, { repository: 'A' });
    assert.equal(
      revised.receivedInputs![1].replacesId,
      revised.receivedInputs![0].id,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

type App = Awaited<ReturnType<typeof createApplication>>;
async function request<T>(
  server: App,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await server.app.request(
    path,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = await res.json();
  assert.equal(res.ok, true, JSON.stringify(data));
  return data as T;
}
async function finished(server: App, id: string) {
  for (let i = 0; i < 300; i++) {
    const item = await server.items.get(id);
    if (
      item.execution &&
      ['completed', 'failed', 'cancelled'].includes(item.execution.status)
    )
      return item;
    await delay(10);
  }
  throw Error('运行未结束');
}
async function method(server: App, definition: Definition) {
  const work = await server.work.createWork('核查方法', []);
  await server.flow.saveDraft(work.id, undefined, definition);
  return server.files.read(work.id);
}
async function itemMethod(
  server: App,
  item: WorkItemView,
  source: Work,
  bindings?: Record<string, ItemInputSelection[]>,
  bind = true,
) {
  const fixed = await server.files.readDefinition(source.id, source.draftId!);
  const current = await server.files.read(item.workId);
  await server.flow.saveDraft(item.workId, current.draftId, fixed);
  if (bind)
    await server.composition.bindInputs(
      item.id,
      (await server.items.get(item.id)).revision,
      bindings ?? {
        [fixed.inputs[0]]: item.receivedInputs?.length
          ? item.receivedInputs.map((input) => ({
              kind: 'received',
              inputId: input.id,
            }))
          : item.materials.map((material) => ({
              kind: 'material',
              materialId: material.id,
            })),
      },
    );
  return server.files.read(item.workId);
}
async function runItem(server: App, id: string) {
  return request(server, `/api/items/${id}/actions`, {
    action: 'run',
    baseRevision: (await server.items.get(id)).revision,
  });
}
const identity: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  inputContracts: {
    input: {
      item: {
        type: 'object',
        required: ['repository', 'ref'],
        properties: { repository: { type: 'string' }, ref: { type: 'string' } },
      },
    },
  },
  nodes: [
    {
      id: 'check',
      label: '核查',
      kind: 'agent',

      operation: 'map',
      task: '检查',
    },
  ],
  edges: [{ from: ['$input', 'input'], to: ['check', 'input'] }],
  outputs: { result: ['check', 'output'] },
};

test('真实HTTP received JSON修订后启动，旧输入和跨项M01不变', async () => {
  const root = await mkdtemp(join(tmpdir(), 'decomposition-http-'));
  const seen: NodeExecution[] = [];
  try {
    const server = await createApplication({
      dataRoot: root,
      executeNode: async (context) => {
        seen.push(context);
        return { checked: context.inputs.input[0].value };
      },
    });
    let work = await method(server, identity);
    const parent = await server.items.create({
      title: '父项',
      goal: '核查',
      materials: ['父M01'],
    });
    const { receipts } = await request<{ receipts: { childId: string }[] }>(
      server,
      `/api/items/${parent.id}/actions`,
      {
        action: 'createChildren',
        candidates: [
          {
            id: 'a',
            title: 'A',
            goal: '检查A',
            inputs: [{ label: '仓库', value: { repository: 'A' } }],
          },
        ],
      },
    );
    const child = await server.items.get(receipts[0].childId);
    work = await itemMethod(server, child, work, undefined, false);
    const before = await request<ItemPreparation>(
      server,
      `/api/items/${child.id}/prepare`,
      {
        inputBindings: {
          input: [{ kind: 'received', inputId: child.receivedInputs![0].id }],
        },
      },
    );
    assert.ok(before.issues.length);
    assert.deepEqual(before.inputBindings.input, [
      { kind: 'received', inputId: child.receivedInputs![0].id },
    ]);
    const revised = await request<WorkItemView>(
      server,
      `/api/items/${child.id}/actions`,
      {
        action: 'reviseInput',
        baseRevision: (await server.items.get(child.id)).revision,
        inputId: child.receivedInputs![0].id,
        value: { repository: 'A', ref: 'develop' },
      },
    );
    const ready = await request<ItemPreparation>(
      server,
      `/api/items/${child.id}/prepare`,
      {
        inputBindings: {
          input: [
            { kind: 'received', inputId: revised.receivedInputs!.at(-1)!.id },
          ],
        },
      },
    );
    assert.deepEqual(ready.issues, []);
    assert.equal(ready.inputs!.input.length, 1);
    await server.composition.bindInputs(
      child.id,
      revised.revision,
      ready.inputBindings,
    );
    await runItem(server, child.id);
    const done = await finished(server, child.id);
    assert.equal(
      done.execution?.status,
      'completed',
      done.execution?.error ?? '执行失败',
    );
    assert.deepEqual(seen[0].inputs.input[0].value, {
      repository: 'A',
      ref: 'develop',
    });
    assert.deepEqual(seen[0].materials, []);
    assert.equal(seen[0].workItem?.receivedInputs, undefined);
    assert.deepEqual(revised.receivedInputs![0].value, { repository: 'A' });
    await server.items.reviseInput(child.id, {
      expectedRevision: (await server.items.get(child.id)).revision,
      inputId: revised.receivedInputs![1].id,
      value: { repository: 'A', ref: 'release' },
    });
    const saved = await server.files.read(work.id);
    assert.deepEqual(saved.runs[0].inputs.input[0].value, {
      repository: 'A',
      ref: 'develop',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('同源候选、同父trackingKey、异父关联与缺目标逐条回执', async () => {
  const root = await mkdtemp(join(tmpdir(), 'decomposition-candidates-'));
  try {
    const candidates = [
      {
        id: 'a',
        title: 'A',
        goal: '检查A',
        trackingKey: 'A',
        inputs: [{ label: '目标', value: { repository: 'A' } }],
      },
      { id: 'b', title: 'B', goal: '', trackingKey: 'B', inputs: [] },
    ];
    const server = await createApplication({
      dataRoot: root,
      executeNode: async () => candidates,
    });
    const definition = { ...identity, inputContracts: undefined };
    let work = await method(server, definition);
    const parent = await server.items.create({
      title: '父',
      goal: '拆分',
      materials: ['报告'],
    });
    work = await itemMethod(server, parent, work);
    await runItem(server, parent.id);
    const item = await finished(server, parent.id);
    const saved = await server.files.read(work.id),
      run = saved.runs.find((r) => r.id === item.runs[0].runId)!;
    const source: CandidateSource = {
      kind: 'output',
      workId: work.id,
      runId: run.id,
      resultId: run.results[0].id,
      port: 'output',
      index: 0,
    };
    const first = await server.items.createChildren(parent.id, { source });
    assert.deepEqual(
      first.receipts.map((r) => r.status),
      ['created', 'needs-input'],
    );
    const again = await server.items.createChildren(parent.id, { source });
    assert.equal(again.receipts[0].childId, first.receipts[0].childId);
    assert.equal(again.receipts[0].status, 'linked');
    const sameKey = await server.items.createChildren(parent.id, {
      candidates: [{ ...candidates[0], id: 'next' }],
    });
    assert.equal(sameKey.receipts[0].childId, first.receipts[0].childId);
    const other = await server.items.create({
      title: '另一父',
      goal: '另外',
      materials: [],
    });
    const bad = await server.items.createChildren(other.id, {
      candidates: [
        { ...candidates[0], existingChildId: first.receipts[0].childId },
      ],
    });
    assert.equal(bad.receipts[0].status, 'failed');
    const read = await server.items.candidates(parent.id, source);
    assert.equal(read.receipts[0].childId, first.receipts[0].childId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('精确输出交接与跨两层完成依据包含原值，子项重开不改旧汇总', async () => {
  const root = await mkdtemp(join(tmpdir(), 'decomposition-completion-'));
  try {
    const server = await createApplication({
      dataRoot: root,
      executeNode: async () => ({ verdict: 'clear' }),
    });
    let work = await method(server, {
      ...identity,
      inputContracts: undefined,
    });
    const overall = await server.items.create({
      title: '季度',
      goal: '核查全部',
      materials: [],
    });
    const target = await server.items.create({
      title: 'target',
      goal: '核查目标',
      materials: ['父M01'],
      parentId: overall.id,
    });
    work = await itemMethod(server, target, work);
    await runItem(server, target.id);
    await finished(server, target.id);
    let saved = await server.files.read(work.id);
    const run = saved.runs[0],
      result = run.results[0];
    await server.files.change(work.id, (w) => {
      w.runs[0].results[0].outputs.other = [
        { ...result.outputs.output[0], value: { verdict: 'exact selected' } },
      ];
    });
    const source = {
      workId: work.id,
      runId: run.id,
      resultId: result.id,
      port: 'other',
      index: 0,
    };
    const { receipts } = await server.items.createChildren(target.id, {
      candidates: [
        {
          id: 'a',
          title: '仓库A',
          goal: '确认A',
          criteria: ['已确认'],
          inputs: [
            { label: '已有结果', value: { verdict: 'exact selected' }, source },
          ],
        },
      ],
    });
    const child = await server.items.get(receipts[0].childId!);
    await server.items.addEvidence(child.id, ['子M01']);
    const received = child.receivedInputs![0];
    await itemMethod(server, child, work, undefined, false);
    const prepared = await request<ItemPreparation>(
      server,
      `/api/items/${child.id}/prepare`,
      {
        inputBindings: {
          input: [
            { kind: 'received', inputId: received.id },
            { kind: 'material', materialId: 'M01' },
          ],
        },
      },
    );
    assert.equal(prepared.inputs!.input[0].materialIds.length, 1);
    assert.notEqual(prepared.inputs!.input[0].materialIds[0], 'M01');
    await server.items.criteria(
      child.id,
      child.criteria.map((c) => ({
        ...c,
        met: true,
        evidence: '源码核查确认',
        references: [
          { ...source, definitionId: run.definitionId, label: '核查结果' },
        ],
      })),
    );
    await server.items.complete(child.id);
    await server.items.complete(target.id);
    const completions = await server.items.completionInputs(overall.id);
    const overallWork = await itemMethod(
      server,
      await server.items.get(overall.id),
      work,
      { input: completions.selections },
    );
    const summary = await request<ItemPreparation>(
      server,
      `/api/items/${overall.id}/prepare`,
      {},
    );
    assert.equal(summary.issues.length, 0);
    const value = summary.inputs!.input[0].value as {
      children: { criteria: { outputs: { value: Json }[] }[] }[];
    };
    assert.deepEqual(value.children[0].criteria[0].outputs[0].value, {
      verdict: 'exact selected',
    });
    await runItem(server, overall.id);
    await finished(server, overall.id);
    const frozen = structuredClone(
      (await server.files.read(overallWork.id)).runs.at(-1)!.inputs,
    );
    await server.items.reopen(child.id, '新证据', true);
    saved = await server.files.read(overallWork.id);
    assert.deepEqual(saved.runs.at(-1)!.inputs, frozen);
    const current = await server.items.completionInputs(overall.id);
    assert.equal(current.selections.length, 0);
    assert.equal(current.uncovered[0].id, target.id);
    const historical = await request<ItemPreparation>(
      server,
      `/api/items/${overall.id}/prepare`,
      {
        inputBindings: {
          input: [
            {
              ...(summary.inputBindings.input[0] as object),
              historical: true,
            },
          ],
        },
      },
    );
    assert.equal(historical.issues.length, 0);
    assert.deepEqual(historical.inputs!.input[0].value, {
      ...(summary.inputs!.input[0].value as Record<string, Json>),
      historical: true,
    });
    await server.items.scope(target.id, 'excluded', '阶段不再包含');
    const excluded = await request<ItemPreparation>(
      server,
      `/api/items/${overall.id}/prepare`,
      {
        inputBindings: {
          input: [
            {
              ...(summary.inputBindings.input[0] as object),
              historical: true,
            },
          ],
        },
      },
    );
    assert.equal(excluded.issues.length, 0);
    assert.equal(
      (excluded.inputs!.input[0].value as Record<string, Json>).historical,
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('范围排除不重开上级，恢复纳入需一次确认，完成与建项交错不产生已结未完成范围', async () => {
  const root = await mkdtemp(join(tmpdir(), 'decomposition-scope-'));
  try {
    const server = await createApplication({
      dataRoot: root,
      executeNode: async () => null,
    });
    const parent = await server.items.create({
      title: '父',
      goal: '处理',
      materials: [],
    });
    const child = await server.items.create({
      title: '子',
      goal: '核查',
      parentId: parent.id,
      materials: [],
      criteria: ['完成'],
    });
    await server.items.criteria(
      child.id,
      child.criteria.map((c) => ({ ...c, met: true, evidence: '确认' })),
    );
    await server.items.complete(child.id);
    await server.items.complete(parent.id);
    await server.items.scope(child.id, 'excluded', '范围不含');
    await server.items.reopen(child.id, '补充');
    assert.equal((await server.items.get(parent.id)).status, 'completed');
    const rejected = await server.app.request(
      `/api/items/${child.id}/actions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'scope', status: 'included' }),
      },
    );
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).affectedAncestors[0].id, parent.id);
    await server.items.scope(child.id, 'included', '', true);
    assert.equal((await server.items.get(parent.id)).status, 'open');
    const outcomes = await Promise.allSettled([
      server.items.complete(parent.id),
      server.items.createChildren(parent.id, {
        candidates: [
          { id: 'extra', title: '额外', goal: '处理额外', inputs: [] },
        ],
      }),
    ]);
    assert.equal(outcomes[0].status, 'rejected');
    assert.equal((await server.items.get(parent.id)).status, 'open');
    const page = await request<WorkItemSummaryPage>(
      server,
      `/api/items?summary=true&rootId=${parent.id}&view=todo&pageSize=1`,
    );
    assert.equal(page.total, 2);
    assert.equal(page.items.length, 1);
    assert.equal(page.scopeSummary.total, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('1000叶子有历史的范围摘要分页只读取共享方法一次，关联不丢跨方法轮次', async () => {
  const root = await mkdtemp(join(tmpdir(), 'decomposition-scale-'));
  try {
    const server = await createApplication({
      dataRoot: root,
      executeNode: async () => ({
        answer: '结论',
        evidence: '证据'.repeat(500),
      }),
    });
    let work = await method(server, {
      ...identity,
      inputContracts: undefined,
    });
    const rootItem = await server.items.create({
      title: '季度',
      goal: '全部',
      materials: [],
    });
    const branches = [];
    for (let n = 0; n < 100; n++)
      branches.push(
        await server.items.create({
          title: `目标${n}`,
          goal: '目标',
          parentId: rootItem.id,
          materials: [],
        }),
      );
    const seed = await server.items.create({
      title: '模板',
      goal: '检查',
      materials: ['材料'.repeat(500)],
    });
    work = await itemMethod(server, seed, work);
    await runItem(server, seed.id);
    const seedDone = await finished(server, seed.id);
    const sourceRun = (await server.files.read(work.id)).runs[0];
    const savedItems: WorkItem[] = [];
    const runs: Run[] = [];
    for (let i = 0; i < 1000; i++) {
      const id = `scale-${i}`,
        refs = [];
      for (let n = 0; n < 4; n++) {
        const runId = `${id}-run-${n}`;
        runs.push({
          ...structuredClone(sourceRun),
          id: runId,
          workItem: { ...sourceRun.workItem!, id },
          results: sourceRun.results.map((r) => ({
            ...r,
            id: `${id}-result-${n}`,
          })),
        });
        refs.push({
          workId: work.id,
          runId,
          definitionId: sourceRun.definitionId,
        });
      }
      const item: WorkItem = {
        ...structuredClone(seedDone),
        id,
        key: id,
        title: `仓库 ${i}`,
        parentId: branches[i % 100].id,
        runs: refs,
        history: Array.from({ length: 20 }, (_, n) => ({
          id: `${id}-history-${n}`,
          at: seedDone.createdAt,
          kind: 'progress',
          summary: `第${n}次调查` + '资料'.repeat(100),
        })),
      };
      savedItems.push(item);
    }
    await server.files.change(work.id, (w) => {
      w.runs.push(...runs);
    });
    for (let offset = 0; offset < savedItems.length; offset += 100)
      await Promise.all(
        savedItems
          .slice(offset, offset + 100)
          .map((item) =>
            writeFile(
              join(root, 'work-items', `${item.id}.json`),
              JSON.stringify(item),
            ),
          ),
      );
    const originalSelect = server.files.select.bind(server.files);
    let methodReads = 0;
    server.files.select = async (id, project) => {
      methodReads++;
      return originalSelect(id, project);
    };
    const timings = [];
    for (let i = 0; i < 3; i++) {
      methodReads = 0;
      const start = performance.now();
      const page = await request<WorkItemSummaryPage>(
        server,
        `/api/items?summary=true&rootId=${rootItem.id}&view=todo&page=2&pageSize=25`,
      );
      const elapsed = performance.now() - start,
        bytes = Buffer.byteLength(JSON.stringify(page));
      assert.equal(page.total, 1000);
      assert.equal(page.items.length, 25);
      assert.equal(methodReads, i === 0 ? 1 : 0);
      assert.ok(bytes < 70000);
      assert.ok(
        page.items.every((row) => !('history' in row) && !('materials' in row)),
      );
      assert.equal(page.items[0].runs.length, 4);
      timings.push({ elapsedMs: Math.round(elapsed), bytes, methodReads });
    }
    const associations = await request<WorkItemSummaryPage>(
      server,
      '/api/items?summary=true&ids=scale-999,scale-998&pageSize=1',
    );
    assert.equal(associations.items.length, 2);
    assert.equal(associations.items[0].runs.length, 4);
    const evidence =
      'conductor/tracks/feature-workitem-decomposition_20261023/evidence/backend';
    await mkdir(evidence, { recursive: true });
    await writeFile(
      join(evidence, 'scale.json'),
      JSON.stringify(
        {
          leafCount: 1000,
          branches: 100,
          historyPerLeaf: 20,
          runsPerLeaf: 4,
          timings,
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('子项保存与父回执部分失败保留成功前缀，同源无key补建不重复身份', async () => {
  const root = await mkdtemp(join(tmpdir(), 'decomposition-partial-'));
  try {
    const candidates = [
      { id: 'a', title: 'A', goal: 'A', inputs: [] },
      { id: 'b', title: 'B', goal: 'B', inputs: [] },
    ];
    const server = await createApplication({
      dataRoot: root,
      executeNode: async () => candidates,
    });
    let work = await method(server, {
      ...identity,
      inputContracts: undefined,
    });
    const parent = await server.items.create({
      title: '父',
      goal: '拆分',
      materials: ['材料'],
    });
    work = await itemMethod(server, parent, work);
    await runItem(server, parent.id);
    await finished(server, parent.id);
    const run = (await server.files.read(work.id)).runs[0];
    const source: CandidateSource = {
      kind: 'output',
      workId: work.id,
      runId: run.id,
      resultId: run.results[0].id,
      port: 'output',
      index: 0,
    };
    let failReceipt = true,
      failChild = true;
    const read = async (id: string) =>
      JSON.parse(
        await readFile(join(root, 'work-items', `${id}.json`), 'utf8'),
      ) as WorkItem;
    const save = async (item: WorkItem) => {
      if (failChild && item.parentId && item.goal === 'B') {
        failChild = false;
        throw Error('fixture磁盘写入失败B');
      }
      if (
        failReceipt &&
        item.id === parent.id &&
        item.history.some((h) => h.childLinks?.length)
      ) {
        failReceipt = false;
        throw Error('fixture回执写入失败');
      }
      await writeFile(
        join(root, 'work-items', `${item.id}.json`),
        JSON.stringify(item),
      );
    };
    const storage: ItemStorage = {
      read,
      save,
      all: async () =>
        Promise.all(
          (await readdir(join(root, 'work-items')))
            .filter((n) => n.endsWith('.json'))
            .map((n) => read(n.slice(0, -5))),
        ),
      view: async (item) => ({ ...item, effectiveStatus: 'open' }),
      serial: async (_key, operation) => operation(),
      record: (item, kind, summary, extra = {}) => {
        item.history.push({
          id: randomUUID(),
          at: new Date().toISOString(),
          kind,
          summary,
          ...extra,
        });
      },
      createRaw: async (input, metadata = {}) => {
        const child: WorkItem = {
          ...structuredClone(parent),
          id: randomUUID(),
          key: randomUUID(),
          title: input.title,
          goal: input.goal,
          materials: [],
          runs: [],
          history: [],
          criteria: [],
          receivedInputs: [],
          ...metadata,
        };
        await save(child);
        return { ...child, effectiveStatus: 'open' };
      },
    };
    const children = createChildrenService(storage, server.files);
    const first = await children.createChildren(parent.id, { source });
    assert.equal(first.receipts.length, 2);
    assert.equal(first.receipts[0].status, 'failed');
    assert.ok(first.receipts[0].childId);
    const second = await children.createChildren(parent.id, { source });
    assert.equal(second.receipts[0].status, 'linked');
    assert.equal(second.receipts[0].childId, first.receipts[0].childId);
    assert.equal(first.receipts[1].status, 'failed');
    assert.equal(second.receipts[1].status, 'created');
    const third = await children.createChildren(parent.id, { source });
    assert.deepEqual(
      third.receipts.map((r) => r.status),
      ['linked', 'linked'],
    );
    assert.equal(
      (await storage.all()).filter((i) => i.parentId === parent.id).length,
      2,
    );
    const replacement = await children.createChildren(parent.id, {
      source,
      candidateIds: ['a'],
      edits: [{ ...candidates[0], existingChildId: third.receipts[1].childId }],
    });
    assert.equal(replacement.receipts[0].status, 'failed');
    const fourth = await children.createChildren(parent.id, {
      source,
      candidateIds: ['a'],
    });
    assert.equal(fourth.receipts[0].childId, first.receipts[0].childId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('1000候选实际建立与重进分页复用固定来源读取', async () => {
  const root = await mkdtemp(join(tmpdir(), 'decomposition-candidate-scale-'));
  try {
    const candidates = Array.from({ length: 1000 }, (_, i) => ({
      id: `candidate-${i}`,
      title: `反馈 ${i}`,
      goal: `查明反馈 ${i}`,
      inputs: [
        {
          label: '客户反馈',
          value: {
            customer: `customer-${i}`,
            description: '实际反馈材料'.repeat(50),
          },
        },
      ],
    }));
    const server = await createApplication({
      dataRoot: root,
      executeNode: async () => candidates,
    });
    let work = await method(server, {
      ...identity,
      inputContracts: undefined,
    });
    const parent = await server.items.create({
      title: '客户反馈',
      goal: '跟踪独立问题',
      materials: ['输入报告'],
    });
    work = await itemMethod(server, parent, work);
    await runItem(server, parent.id);
    await finished(server, parent.id);
    const run = (await server.files.read(work.id)).runs[0];
    const source: CandidateSource = {
      kind: 'output',
      workId: work.id,
      runId: run.id,
      resultId: run.results[0].id,
      port: 'output',
      index: 0,
    };
    const originalRead = server.files.read.bind(server.files);
    let reads = 0;
    server.files.read = async (id) => {
      // New child identities persist their own private Work; count only fixed source reads.
      if (id === work.id) reads++;
      return originalRead(id);
    };
    const started = performance.now();
    const created = await server.items.createChildren(parent.id, { source });
    const creationMs = performance.now() - started;
    assert.equal(created.receipts.length, 1000);
    assert.ok(
      created.receipts.every((r) => r.status === 'created' && r.childId),
    );
    assert.equal(reads, 1);
    const creationReads = reads;
    reads = 0;
    const pageStarted = performance.now();
    const page = await request<{
      candidates: unknown[];
      receipts: { childId?: string }[];
      candidateIds: string[];
      total: number;
    }>(server, `/api/items/${parent.id}/actions`, {
      action: 'candidates',
      source,
      page: 20,
      pageSize: 25,
    });
    const pageMs = performance.now() - pageStarted;
    assert.equal(page.candidates.length, 25);
    assert.equal(page.total, 1000);
    assert.equal(page.candidateIds.length, 1000);
    assert.equal(page.receipts.filter((r) => r.childId).length, 1000);
    assert.equal(reads, 1);
    const repeated = await server.items.createChildren(parent.id, {
      source,
      candidateIds: ['candidate-499'],
    });
    assert.equal(repeated.receipts[0].childId, created.receipts[499].childId);
    await writeFile(
      'conductor/tracks/feature-workitem-decomposition_20261023/evidence/backend/candidate-scale.json',
      JSON.stringify(
        {
          candidates: 1000,
          creationMs: Math.round(creationMs),
          creationMethodReads: creationReads,
          pageMs: Math.round(pageMs),
          pageMethodReads: 1,
          pageBytes: Buffer.byteLength(JSON.stringify(page)),
          pageRows: page.candidates.length,
          linkedRows: page.receipts.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('只读缓存隔离返回值，并在工作项写入与运行变化后立即刷新', async () => {
  const root = await mkdtemp(join(tmpdir(), 'decomposition-cache-'));
  try {
    const server = await createApplication({
      dataRoot: root,
      executeNode: async () => ({ answer: '已核查' }),
    });
    let work = await method(server, {
      ...identity,
      inputContracts: undefined,
    });
    const item = await server.items.create({
      title: '核查',
      goal: '检查',
      materials: ['原文'],
    });
    work = await itemMethod(server, item, work);
    await runItem(server, item.id);
    await finished(server, item.id);
    const originalSelect = server.files.select.bind(server.files);
    let reads = 0;
    server.files.select = async (id, project) => {
      reads++;
      return originalSelect(id, project);
    };
    const [first, second] = await Promise.all([
      server.items.summaries(),
      server.items.summaries({ ids: [item.id] }),
    ]);
    assert.equal(reads, 1);
    assert.equal(first.items[0].execution?.status, 'completed');
    first.items[0].title = '调用方改动';
    second.items[0].runs.length = 0;
    const fresh = await server.items.summaries({ ids: [item.id] });
    assert.equal(fresh.items[0].title, '核查');
    assert.equal(fresh.items[0].runs.length, 1);
    assert.equal(reads, 1);
    const copy = await server.files.read(work.id);
    copy.title = '临时改动';
    assert.notEqual((await server.files.read(work.id)).title, '临时改动');
    await server.files.change(work.id, (w) => {
      w.runs[0].status = 'waiting';
    });
    const waiting = await server.items.summaries({ ids: [item.id] });
    assert.equal(waiting.items[0].effectiveStatus, 'waiting');
    const child = await server.items.create({
      title: '子项',
      goal: '独立问题',
      parentId: item.id,
      materials: [],
    });
    assert.equal(
      (await server.items.summaries({ parentId: item.id })).total,
      1,
    );
    const cloned: WorkItem = {
      ...child,
      id: 'external-fixture',
      key: 'external-fixture',
    };
    await writeFile(
      join(root, 'work-items', 'external-fixture.json'),
      JSON.stringify(cloned),
    );
    assert.equal(
      (await server.items.summaries({ parentId: item.id })).total,
      2,
    );
    // Atomic external fixture replacement is visible on the next disk-version check.
    const path = join(root, work.id, 'work.json');
    const changed = JSON.parse(await readFile(path, 'utf8'));
    changed.title = '外部固定样例';
    await writeFile(path, JSON.stringify(changed));
    assert.equal((await server.files.read(work.id)).title, '外部固定样例');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('关联新扫描后明确接收结构化材料，重复提交不覆盖目标或重复输入', async () => {
  const root = await mkdtemp(join(tmpdir(), 'decomposition-receive-'));
  try {
    let phase = 1;
    const server = await createApplication({
      dataRoot: root,
      executeNode: async () => [
        {
          id: `candidate-${phase}`,
          title: '反馈A',
          goal: '查明反馈A',
          trackingKey: 'feedback-A',
          criteria: ['已查明'],
          inputs: [{ label: '新增线索', value: { phase } }],
        },
      ],
    });
    let work = await method(server, {
      ...identity,
      inputContracts: undefined,
    });
    const parent = await server.items.create({
      title: '反馈调查',
      goal: '查明反馈',
      materials: ['报告'],
    });
    work = await itemMethod(server, parent, work);
    const nextSource = async () => {
      await runItem(server, parent.id);
      const done = await finished(server, parent.id);
      const run = (await server.files.read(work.id)).runs.find(
        (r) => r.id === done.runs.at(-1)!.runId,
      )!;
      return {
        kind: 'output' as const,
        workId: work.id,
        runId: run.id,
        resultId: run.results[0].id,
        port: 'output',
        index: 0,
      };
    };
    const first = await server.items.createChildren(parent.id, {
      source: await nextSource(),
    });
    const childId = first.receipts[0].childId!;
    phase = 2;
    const source = await nextSource();
    const linked = await server.items.createChildren(parent.id, { source });
    assert.equal(linked.receipts[0].status, 'linked');
    assert.equal((await server.items.get(childId)).receivedInputs!.length, 1);
    const appended = await request<{
      receipts: { inputsAppended?: boolean }[];
    }>(server, `/api/items/${parent.id}/actions`, {
      action: 'createChildren',
      source,
      appendInputs: true,
    });
    assert.equal(appended.receipts[0].inputsAppended, true);
    let child = await server.items.get(childId);
    assert.deepEqual(
      child.receivedInputs!.map((i) => i.value),
      [{ phase: 1 }, { phase: 2 }],
    );
    assert.equal(child.goal, '查明反馈A');
    await server.items.createChildren(parent.id, {
      source,
      appendInputs: true,
    });
    assert.equal((await server.items.get(childId)).receivedInputs!.length, 2);
    assert.equal(
      (await server.items.candidates(parent.id, source)).receipts[0]
        .inputsAppended,
      true,
    );
    await server.items.criteria(
      child.id,
      child.criteria.map((c) => ({ ...c, met: true, evidence: '确认' })),
    );
    await server.items.complete(child.id);
    const same = await server.items.createChildren(parent.id, {
      source,
      appendInputs: true,
    });
    assert.equal(same.receipts[0].inputsAppended, true);
    phase = 3;
    const third = await nextSource();
    const rejected = await server.items.createChildren(parent.id, {
      source: third,
      appendInputs: true,
    });
    assert.equal(rejected.receipts[0].status, 'failed');
    assert.equal(rejected.receipts[0].childId, childId);
    assert.match(rejected.receipts[0].error!, /重新打开/);
    child = await server.items.get(childId);
    assert.equal(child.receivedInputs!.length, 2);
    assert.equal(child.status, 'completed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('全局精确标题和编号搜索优先本项，保留后代关联匹配', async () => {
  const root = await mkdtemp(join(tmpdir(), 'decomposition-search-'));
  try {
    const items = createWorkItems(root, createFiles(root));
    const parent = await items.create({
      key: 'QUARTER-1',
      title: '季度漏洞核查',
      goal: '整体',
      materials: [],
    });
    for (let i = 0; i < 30; i++)
      await items.create({
        title: `仓库${i}`,
        goal: '子问题',
        parentId: parent.id,
        materials: [],
      });
    const page = await items.summaries({ query: '季度漏洞核查', pageSize: 25 });
    assert.equal(page.total, 31);
    assert.equal(page.items[0].id, parent.id);
    const key = await items.summaries({ query: 'QUARTER-1' });
    assert.equal(key.items[0].id, parent.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
