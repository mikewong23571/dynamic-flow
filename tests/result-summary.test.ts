import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index';
import { createFlow, checkDefinition } from '../src/server/flow/index';
import { createWorkService } from '../src/server/work/index';
import { createRuns } from '../src/server/runs/index';
import {
  isRunResultSummary,
  runResultSummarySchema,
} from '../src/shared/result-summary';
import { removeNode } from '../src/client/core/definition';
import type { Definition, Json } from '../src/shared/records';

const summary = {
  title: '核查结果',
  summary: '已有三项核查记录',
  scope: '仅本轮三个仓库',
  metrics: [{ label: '结果数', value: 3 }],
  limitations: ['扫描版本关联待确认'],
  nextAction: '人工复核',
};
const base: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  nodes: [
    {
      id: 'summary',
      label: '摘要',
      kind: 'agent',

      operation: 'aggregate',
      task: '输出本轮结果',
      expectedOutput: runResultSummarySchema,
    },
  ],
  edges: [{ from: ['$input', 'input'], to: ['summary', 'input'] }],
  outputs: { overview: ['summary', 'output'] },
  summaryOutput: 'overview',
};
test('summary declaration selects an exact aggregate output, and node removal clears it', () => {
  assert.deepEqual(checkDefinition(base), []);
  assert.ok(
    checkDefinition({ ...base, summaryOutput: 'absent' }).some(
      (issue) => issue.field === 'summaryOutput',
    ),
  );
  assert.ok(
    checkDefinition({
      ...base,
      nodes: [{ ...base.nodes[0], operation: 'map' }],
    }).some((issue) => issue.field === 'summaryOutput'),
  );
  assert.ok(
    checkDefinition({
      ...base,
      outputs: { overview: ['summary', 'event'] },
    }).some((issue) => issue.field === 'summaryOutput'),
  );
  assert.equal(removeNode(base, 'summary').summaryOutput, undefined);
});
test('expectedOutput is the only output contract; summary display recognition is independent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'result-summary-'));
  const files = createFiles(root),
    flow = createFlow(files),
    work = await createWorkService(files).createWork('摘要测试', ['真实输入']);
  let reply: Json = summary;
  const runs = createRuns(files, async () => reply);
  try {
    const declared = base;
    const id = await flow.saveDraft(work.id, undefined, declared);
    const input = {
      input: [
        { sampleId: 's', value: '范围', materialIds: [], sourceResultIds: [] },
      ],
    };
    const start = async (definitionId: string) => {
      const id = await runs.start(work.id, {
        definitionId,
        scope: 'full',
        inputs: input,
      });
      await runs.wait(id);
      return (await files.read(work.id)).runs.find((run) => run.id === id)!;
    };
    const valid = await start(id);
    assert.equal(valid.status, 'completed');
    assert.deepEqual(valid.results[0].outputs.output[0].value, summary);
    for (const invalid of [
      { ...summary, scope: '' },
      { ...summary, metrics: [{ label: '结果数', value: null }] },
      { ...summary, invented: true },
      '普通报告',
    ]) {
      reply = invalid;
      const failed = await start(id);
      assert.equal(failed.status, 'failed');
      assert.match(failed.results[0].error!, /输出/);
      assert.deepEqual(failed.results[0].outputs, {});
      assert.equal(isRunResultSummary(invalid), false);
    }
    let previous = id;
    for (const [value, expectedOutput] of [
      [
        { summary: '模型自主汇集结果', count: 3 },
        { type: 'object', required: ['summary', 'count'] },
      ],
      [
        [{ id: 'R1', conclusion: '需复核' }],
        { type: 'array', items: { type: 'object' } },
      ],
      ['普通报告', undefined],
    ] as [Json, Json | undefined][]) {
      const version = await flow.saveDraft(work.id, previous, {
        ...base,
        nodes: [{ ...base.nodes[0], expectedOutput }],
      });
      reply = value;
      const run = await start(version);
      assert.equal(run.status, 'completed', run.results[0]?.error ?? '');
      assert.deepEqual(run.results[0].outputs.output[0].value, value);
      assert.equal(isRunResultSummary(value), false);
      previous = version;
    }
    assert.equal(
      (await files.read(work.id)).runs.find((run) => run.id === valid.id)!
        .definitionId,
      id,
    );
    assert.equal(isRunResultSummary(summary), true);
  } finally {
    await runs.close();
    await rm(root, { recursive: true, force: true });
  }
});
