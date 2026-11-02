import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index';
import type {
  Definition,
  CriterionReference,
  WorkItemView,
} from '../src/shared/records';

test('additive criterion citation preserves manual fields, merges concurrent references, deduplicates, validates scope and leaves fixed runs unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'criterion-citation-'));
  const app = await createApplication({ dataRoot: root });
  try {
    const def: Definition = {
      schemaVersion: 1,
      inputs: ['materials'],
      nodes: [
        {
          id: 'check',
          label: '核查记录',
          kind: 'function',

          operation: 'map',
          functionName: 'identity',
        },
      ],
      edges: [{ from: ['$input', 'materials'], to: ['check', 'input'] }],
      outputs: { checks: ['check', 'output'] },
    };
    async function act(id: string, body: unknown) {
      const response = await app.app.request(`/api/items/${id}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 200, await response.clone().text());
      return response.json() as Promise<WorkItemView>;
    }
    let item = await app.items.create({
      key: 'CITE',
      title: '逐项收集依据',
      goal: '复核',
      materials: ['甲', '乙', '丙'],
      criteria: ['源码依据', '扫描范围'],
    });
    const work = await app.files.read(item.workId);
    await app.flow.saveDraft(work.id, undefined, def);
    await app.composition.bindInputs(item.id, item.revision, {
      materials: item.materials.map((m) => ({
        kind: 'material',
        materialId: m.id,
      })),
    });
    item = await act(item.id, {
      action: 'run',
      baseRevision: (await app.items.get(item.id)).revision,
    });
    await app.runs.wait(item.runs.at(-1)!.runId);
    const runs = structuredClone((await app.files.read(work.id)).runs),
      run = runs[0];
    const reference = (index: number): CriterionReference => ({
      workId: work.id,
      runId: run.id,
      definitionId: run.definitionId,
      resultId: run.results[index].id,
      port: 'output',
      index: 0,
      label: `第${index + 1}份原始记录`,
    });
    item = await app.items.criteria(
      item.id,
      item.criteria.map((c, index) => ({
        ...c,
        evidence: index === 0 ? '已有人工说明' : '另一条件说明',
      })),
    );
    const first = item.criteria[0],
      second = item.criteria[1];
    const cite = (
      criterionId: string,
      criterionText: string,
      ref: CriterionReference,
    ) =>
      act(item.id, {
        action: 'citeCriterion',
        criterionId,
        criterionText,
        reference: ref,
      });
    await Promise.all([
      cite(first.id, first.text, reference(0)),
      cite(first.id, first.text, reference(1)),
    ]);
    item = await app.items.get(item.id);
    assert.equal(item.criteria[0].references!.length, 2);
    assert.equal(item.criteria[0].met, false);
    assert.ok(item.criteria[0].evidence.startsWith('已有人工说明'));
    assert.equal(item.criteria[1].evidence, '另一条件说明');
    const revision = item.revision,
      history = item.history.length;
    item = await cite(first.id, first.text, reference(0));
    assert.equal(item.revision, revision);
    assert.equal(item.history.length, history);
    item = await cite(second.id, second.text, reference(2));
    assert.equal(item.criteria[1].met, false);
    assert.equal(item.criteria[0].references!.length, 2);
    item = await app.items.criteria(
      item.id,
      item.criteria.map((c, index) => ({ ...c, met: index === 0 })),
    );
    item = await cite(first.id, first.text, reference(2));
    assert.equal(item.criteria[0].met, true);
    assert.equal(item.criteria[0].references!.length, 3);
    assert.deepEqual((await app.files.read(work.id)).runs, runs);
    const before = item.revision;
    const invalid = await app.app.request(`/api/items/${item.id}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'citeCriterion',
        criterionId: first.id,
        criterionText: first.text,
        reference: { ...reference(0), index: 99 },
      }),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await app.items.get(item.id)).revision, before);
    const other = await app.items.create({
      key: 'OTHER-CITE',
      title: '另一项',
      goal: '独立',
      materials: [],
      criteria: ['条件'],
    });
    await assert.rejects(
      app.items.citeCriterion(
        other.id,
        other.criteria[0].id,
        other.criteria[0].text,
        reference(0),
      ),
      /未交接/,
    );
    item = await app.items.criteria(
      item.id,
      item.criteria.map((c, index) =>
        index === 0 ? { ...c, text: '修改后的条件' } : c,
      ),
    );
    await assert.rejects(
      app.items.citeCriterion(item.id, first.id, first.text, reference(0)),
      /已改变/,
    );
    await assert.rejects(
      app.items.citeCriterion(item.id, 'deleted', '已删除', reference(0)),
      /不存在/,
    );
    item = await app.items.criteria(
      item.id,
      item.criteria.map((c) => ({ ...c, met: true, evidence: '已复核并确认' })),
    );
    await app.items.complete(item.id);
    await assert.rejects(
      app.items.citeCriterion(item.id, first.id, '修改后的条件', reference(0)),
      /结项/,
    );
  } finally {
    await app.runs.close();
    await rm(root, { recursive: true, force: true });
  }
});
