import test from 'node:test';
import assert from 'node:assert/strict';
import {
  finalArtifacts,
  artifactGroups,
  artifactPreview,
} from '../src/client/features/results/result-overview-model.ts';
import type {
  Definition,
  Work,
  Run,
  NodeResult,
} from '../src/shared/records.ts';
const definition: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  nodes: [
    {
      id: 'inspect',
      label: '逐项核查',
      kind: 'agent',
      operation: 'map',
      task: '核查',
    },
  ],
  edges: [{ from: ['$input', 'input'], to: ['inspect', 'input'] }],
  outputs: { checks: ['inspect', 'output'], notes: ['inspect', 'notes'] },
};
const output = (value: string, sampleId: string) => ({
  value,
  sampleId,
  materialIds: [sampleId],
  sourceResultIds: [],
});
function result(id: string, value: string): NodeResult {
  return {
    id,
    runId: 'run1',
    definitionId: 'old',
    nodeId: 'inspect',
    instanceId: id,
    input: {},
    outputs: {
      output: [output(value, id)],
      notes: [output(`说明${value}`, id)],
    },
    status: 'completed',
    activities: [],
    startedAt: '2026-10-22T00:00:00Z',
  };
}
test('final output groups use frozen run and output binding while retaining exact item focus', () => {
  const run = {
    id: 'run1',
    definitionId: 'old',
    scope: 'full',
    results: [result('one', '第一份'), result('two', '第二份')],
    startedAt: '2026-10-22T00:00:00Z',
  } as Run;
  const work = {
    id: 'work',
    draftId: 'new',
    runs: [
      run,
      {
        ...run,
        id: 'run2',
        results: [{ ...result('three', '旧轮'), runId: 'run2' }],
      },
    ],
  } as Work;
  const artifacts = finalArtifacts(work, {
    old: definition,
    new: {
      ...definition,
      nodes: [{ ...definition.nodes[0], label: '新版本标题' }],
    },
  });
  const groups = artifactGroups(artifacts);
  assert.equal(groups.length, 4);
  const first = groups.find(
    (group) => group.run.id === 'run1' && group.port === 'output',
  )!;
  assert.deepEqual(
    first.items.map((item) => item.value),
    ['第一份', '第二份'],
  );
  assert.notEqual(first.items[0].title, first.items[1].title);
  assert.ok(first.title.includes('逐项核查'));
  assert.ok(!first.title.includes('新版本标题'));
  assert.equal(first.items[1].focus.resultId, 'two');
  assert.equal(first.items[1].port, 'output');
  assert.equal(
    groups.find((group) => group.run.id === 'run1' && group.port === 'notes')!
      .items[1].value,
    '说明第二份',
  );
});
test('aliases for one output do not duplicate items, intermediate and undeclared values stay excluded', () => {
  const entry = result('one', '最终值');
  const work = {
    id: 'work',
    runs: [
      {
        id: 'run',
        definitionId: 'saved',
        scope: 'full',
        startedAt: 'now',
        results: [
          entry,
          { ...entry, id: 'intermediate', intermediate: true },
          { ...entry, id: 'planning', purpose: 'planning' },
        ],
      },
    ],
  } as Work;
  const saved = {
    ...definition,
    outputs: { 成果: ['inspect', 'output'], 别名: ['inspect', 'output'] },
  } as Definition;
  const groups = artifactGroups(finalArtifacts(work, { saved }));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[0].items[0].value, '最终值');
});

test('scalar preview retains long source identities without parsing structured-looking strings', () => {
  const full = 'organization/'.repeat(18) + 'customer-records';
  const raw = '{"arbitrary":"literal text"}';
  const fields = artifactPreview({
    revision: 'abc',
    source: full,
    payload: raw,
    nested: { hidden: true },
  });
  assert.equal(fields.find((field) => field.label === 'source')?.full, full);
  assert.equal(fields.find((field) => field.label === 'payload')?.text, raw);
  assert.equal(
    fields.some((field) => field.label === 'nested'),
    false,
  );
});
