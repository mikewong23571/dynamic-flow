import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index';
import { createFlow, checkDefinition } from '../src/server/flow/index';
import { createRuns } from '../src/server/runs/index';
import { createWorkService } from '../src/server/work/index';
import { batchResultDefinition } from '../pipelines/cve/v2/batch-result';
import { isCveBatchResult } from '../pipelines/cve/v2/result-records';
import type {
  Definition,
  Inputs,
  Json,
  OutputReference,
  Run,
} from '../src/shared/records';

test('ordinary CVE pipeline retains 211 findings and exact sources, including 38 earlier-round results, and projects selectable records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cve-records-'));
  const files = createFiles(root),
    flow = createFlow(files),
    works = createWorkService(files);
  const source = await works.createWork(
    'fixed checks',
    Array.from({ length: 211 }, (_, i) => 'original proof ' + i),
  );
  const runs = createRuns(files, async () => {
    throw Error('deterministic aggregation must not invoke a model');
  });
  const verify: Definition = {
    schemaVersion: 1,
    inputs: ['rows'],
    nodes: [
      {
        id: 'verify',
        label: 'fixed check value',
        kind: 'function',
        functionName: 'identity',
        operation: 'map',
      },
    ],
    edges: [{ from: ['$input', 'rows'], to: ['verify', 'input'] }],
    outputs: { checks: ['verify', 'output'] },
  };
  const version = await flow.saveDraft(source.id, undefined, verify);
  const counts = [
    1, 1, 1, 1, 1, 23, 31, 1, 31, 1, 31, 31, 31, 1, 1, 7, 7, 7, 2, 1,
  ];
  const inputs: Inputs = { checks: [] };
  const references: OutputReference[] = [];
  const prior: Run[] = [];
  let ordinal = 0;
  async function execute(
    workId: string,
    definitionId: string,
    values: Inputs,
    materials = source.materials,
  ) {
    const id = await runs.start(workId, {
      definitionId,
      scope: 'full',
      inputs: values,
      materials,
    });
    await runs.wait(id);
    const run = await files.select(workId, (work) =>
      work.runs.find((entry) => entry.id === id)!,
    );
    assert.equal(run.status, 'completed', run.error ?? 'run failed');
    return run;
  }
  try {
    for (const [index, count] of counts.entries()) {
      const values = Array.from({ length: count }, (_, row) => {
        const n = ordinal++,
          material = source.materials[n];
        return {
          sampleId: material.id,
          materialIds: [material.id],
          sourceResultIds: [],
          value: {
            repository: 'repo-' + index + '-' + row,
            requestedRef: 'develop',
            commit: 'abc123',
            target: 'target-' + n,
            conclusion: n < 6 ? '受影响' : n < 165 ? '不受影响' : '证据不足',
            reason: '固定提交的源码判断',
            unknown: ['原扫描版本及部署映射未证实'],
            evidence: [
              { file: 'requirements.txt', lines: '1', excerpt: 'fixture' },
            ],
          },
        };
      });
      const split =
        index === 10 ? 21 : index === 11 ? 12 : index === 12 ? 5 : count;
      const first = await execute(source.id, version, {
        rows: values.slice(0, split),
      });
      const selected = [first];
      if (split < count) {
        prior.push(structuredClone(first));
        selected.push(
          await execute(source.id, version, { rows: values.slice(split) }),
        );
      }
      const outputs = selected.flatMap((run) =>
        run.results.flatMap((result) =>
          result.outputs.output.map((entry, outputIndex) => {
            const ref = {
              workId: source.id,
              runId: run.id,
              resultId: result.id,
              port: 'output',
              index: outputIndex,
            };
            references.push(ref);
            return { source: ref, value: entry.value };
          }),
        ),
      );
      inputs.checks.push({
        sampleId: 'item-' + index,
        materialIds: values.flatMap((entry) => entry.materialIds),
        sourceResultIds: [],
        value: {
          item: { id: 'item-' + index, title: 'CVE-' + index },
          outputs,
        },
      });
    }
    const method = await works.createWork('aggregate selected checks', []);
    const definitionId = await flow.saveDraft(
      method.id,
      undefined,
      batchResultDefinition,
    );
    assert.deepEqual(checkDefinition(batchResultDefinition), []);
    const run = await execute(method.id, definitionId, inputs);
    const value = run.results.find(
      (result) => result.nodeId === 'batch-result',
    )!.outputs.output[0].value;
    assert.ok(isCveBatchResult(value));
    assert.equal(value.items.length, 20);
    const records = value.items.flatMap((item) => item.records);
    assert.equal(records.length, 211);
    assert.equal(
      records.filter((record) => record.finding === '受影响').length,
      6,
    );
    assert.equal(
      records.filter((record) => record.finding === '不受影响').length,
      159,
    );
    assert.equal(
      records.filter((record) => record.finding === '证据不足').length,
      46,
    );
    assert.ok(
      records.every(
        (record) =>
          record.actions.length === 0 &&
          record.disposition.status === 'pending',
      ),
    );
    assert.deepEqual(
      records.map((record) => record.source),
      references,
    );
    const projected = run.results.find(
      (result) => result.nodeId === 'record-list',
    )!.outputs.output[0].value as {
      id: string;
      itemId: string;
      finding: string;
      source: Json;
    }[];
    assert.equal(projected.length, 211);
    assert.equal(new Set(projected.map((record) => record.id)).size, 211);
    assert.deepEqual(
      projected.map((record) => record.finding),
      records.map((record) => record.finding),
    );
    assert.deepEqual(
      projected.map((record) => record.source),
      references,
    );
    assert.equal(prior.flatMap((run) => run.results).length, 38);
    for (const old of prior)
      assert.deepEqual(
        await files.select(source.id, (work) =>
          work.runs.find((run) => run.id === old.id),
        ),
        old,
      );
  } finally {
    runs.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('CVE result identity and disposition are domain validation, not special Definition runtime fields', () => {
  const record = {
    id: 'r',
    title: 'repo',
    scope: 'commit',
    finding: '不受影响',
    reason: 'explicit source finding',
    actions: [],
    disposition: { status: 'pending', reason: '后续处置待判定' },
    questions: ['deployment unknown'],
    source: {
      workId: 'w',
      runId: 'r',
      resultId: 'n',
      port: 'output',
      index: 0,
    },
    detail: null,
  };
  const result = {
    title: 'batch',
    items: [{ id: 'item', title: 'CVE', records: [record] }],
  };
  assert.equal(isCveBatchResult(result), true);
  assert.equal(
    isCveBatchResult({ ...result, items: [...result.items, ...result.items] }),
    false,
  );
  assert.equal(
    isCveBatchResult({
      ...result,
      items: [{ ...result.items[0], records: [record, record] }],
    }),
    false,
  );
  assert.equal(
    isCveBatchResult({
      ...result,
      items: [
        { ...result.items[0], records: [{ ...record, actions: ['process'] }] },
      ],
    }),
    false,
  );
  const decided = {
    ...record,
    actions: ['process', 'clarify'],
    disposition: { status: 'decided', reason: 'explicit follow-up decision' },
  };
  assert.equal(
    isCveBatchResult({
      ...result,
      items: [{ ...result.items[0], records: [decided] }],
    }),
    true,
  );
});
