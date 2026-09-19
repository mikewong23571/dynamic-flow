import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createWorkItems } from '../src/server/work-items/index.ts';

test('业务身份、完成依据和跨方法历史独立于运行', async () => {
  const root = await mkdtemp(join(tmpdir(), 'work-items-'));
  try {
    const files = createFiles(root);
    const methods = createWorkService(files);
    const first = await methods.createWork('调查方法', ['方法示例']);
    const second = await methods.createWork('复核方法', ['复核示例']);
    const items = createWorkItems(root, files);
    const item = await items.create({
      key: 'CVE-DEMO / 产品 A',
      title: '产品 A 影响调查',
      goal: '确认影响并形成有依据的结论',
      workflowId: first.id,
      criteria: ['已确认影响范围'],
      materials: ['公告明确版本 1 受影响'],
    });
    await assert.rejects(
      () =>
        items.create({
          key: item.key,
          title: '重复',
          goal: '重复',
          workflowId: first.id,
          criteria: ['条件'],
          materials: [],
        }),
      /编号/,
    );
    await assert.rejects(() => items.complete(item.id), /完成条件/);
    await assert.rejects(
      () =>
        items.criteria(
          item.id,
          item.criteria.map((c) => ({ ...c, met: true })),
        ),
      /依据/,
    );
    await items.criteria(
      item.id,
      item.criteria.map((c) => ({
        ...c,
        met: true,
        evidence: '公告 M01 明确版本 1 受影响',
      })),
    );
    await items.complete(item.id);
    await assert.rejects(
      () => items.addEvidence(item.id, ['新公告']),
      /重新打开/,
    );
    await items.reopen(item.id, '收到新版本资料，需要重新核对');
    await items.addEvidence(item.id, ['新公告列出修复版本 2']);
    await items.method(item.id, second.id);
    const reopened = await createWorkItems(root, createFiles(root)).get(
      item.id,
    );
    assert.equal(reopened.id, item.id);
    assert.equal(reopened.workflowId, second.id);
    assert.deepEqual(
      reopened.materials.map((m) => m.id),
      ['M01', 'M02'],
    );
    assert.equal(reopened.status, 'open');
    assert.equal(reopened.criteria[0].met, false);
    assert.deepEqual(
      reopened.history.map((h) => h.kind),
      ['created', 'criteria', 'completed', 'reopened', 'evidence', 'method'],
    );
    assert.equal((await items.list({ query: '产品 A' })).total, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('恢复两次文件写入之间的运行关联，重放业务提交只保留一条里程碑', async () => {
  const root = await mkdtemp(join(tmpdir(), 'item-reconcile-'));
  try {
    const files = createFiles(root),
      items = createWorkItems(root, files);
    const method = await createWorkService(files).createWork('调查', [
      '方法示例',
    ]);
    const item = await items.create({
      key: 'CASE-RECOVERY',
      title: '恢复例子',
      goal: '保留事实',
      workflowId: method.id,
      materials: ['事项证据'],
      criteria: ['核验'],
    });
    const run: import('../src/shared/records.ts').Run = {
      id: 'persisted-before-link',
      definitionId: 'fixed-definition',
      scope: 'full',
      inputs: {},
      workItem: item,
      effectMode: 'commit',
      status: 'waiting',
      stopRequested: false,
      nodeStates: { phase: 'running' },
      results: [],
      startedAt: new Date().toISOString(),
    };
    await files.change(method.id, (work) => {
      work.runs.push(run);
    });
    await items.reconcile();
    await items.reconcile();
    let recovered = await items.get(item.id);
    assert.equal(recovered.runs.length, 1);
    assert.equal(recovered.execution?.runId, run.id);
    assert.equal(recovered.progressAt, item.progressAt);
    const node: import('../src/shared/records.ts').FlowNode = {
      id: 'phase',
      label: '调查',
      kind: 'milestone',
      mode: 'all',
      milestone: { stage: '待核验', summary: '证据已整理' },
    };
    const input = {
      input: [
        {
          sampleId: 'M01',
          value: '事项证据',
          materialIds: ['M01'],
          sourceResultIds: ['evidence-result'],
        },
      ],
    };
    await items.milestone(method.id, run, node, input);
    const first = await items.get(item.id);
    await createWorkItems(root, createFiles(root)).milestone(
      method.id,
      run,
      node,
      input,
    );
    recovered = await items.get(item.id);
    assert.equal(
      recovered.history.filter((h) => h.kind === 'milestone').length,
      1,
    );
    assert.equal(recovered.progressAt, first.progressAt);
    assert.deepEqual(recovered.history.at(-1)?.source?.resultIds, [
      'evidence-result',
    ]);
    await items.milestone(
      method.id,
      { ...run, id: 'preview', effectMode: 'preview' },
      node,
      input,
    );
    assert.deepEqual((await items.get(item.id)).history, recovered.history);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
