import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index.ts';
import { checkDefinition } from '../src/server/flow/index.ts';
import type { Definition, Json } from '../src/shared/records.ts';
import {
  assessmentMethod,
  compositionDefinition,
  completionCriteria,
  cveUiProgram,
} from '../pipelines/cve/composition/recipe.ts';
import { alerts, assessments } from '../pipelines/cve/composition/fixture.ts';

test('CVE recipe runs supplied judgments through fixed calls, preserves coverage, publishes declarations and continues exactly two rows', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'composition-business-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = await createApplication({
    dataRoot: root,
    executeNode: async () => {
      throw Error('This recipe must not fabricate a model judgment');
    },
  });
  t.after(() => server.runs.close());
  const req = async (path: string, body?: unknown, expected = 200) => {
    const response = await server.app.request(
      path,
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
    );
    const data = (await response.json()) as any;
    assert.equal(response.status, expected, JSON.stringify(data));
    return data;
  };
  // One small public method; its saved version is fixed in every actual child Run.
  const method = await server.work.createWork(
    '组合示例：核对已有判断与交付依据',
    [],
  );
  const definitionId = await server.flow.saveDraft(
    method.id,
    undefined,
    assessmentMethod,
  );
  const definition = compositionDefinition({ workId: method.id, definitionId });
  assert.deepEqual(checkDefinition(definition), []);
  const item = await req(
    '/api/items',
    {
      title: '假设告警批次',
      goal: '查清影响仓库/ref、实施仓库并逐条说明处置',
      criteria: completionCriteria,
      materials: [
        '明确假设fixture；仅证明组合、来源与覆盖，不证明真实漏洞结论。',
      ],
    },
    201,
  );
  const path = `/api/items/${item.id}/workspace/actions`;
  let ws = await req(path, { action: 'init' });
  const action = async (body: Record<string, unknown>, expected = 200) => {
    const data = await req(
      path,
      { ...body, baseRevision: ws.item.revision },
      expected,
    );
    if (expected === 200) ws = data;
    return data;
  };
  await action({ action: 'saveFlow', definition });
  assert.ok(
    ws.methods.some(
      (m: any) => m.workId === method.id && m.definitionId === definitionId,
    ),
  );
  for (const [inputPort, values] of Object.entries({ alerts, assessments })) {
    for (const value of values)
      await action({
        action: 'addInput',
        inputPort,
        label: value.id,
        value,
        materialIds: [item.materials[0].id],
      });
  }
  const run = async () => {
    await action({ action: 'run' });
    const runId = ws.work.work.runs.at(-1).id;
    await server.runs.wait(runId);
    ws = await req(`/api/items/${item.id}/workspace`);
    const actual = ws.work.work.runs.find((r: any) => r.id === runId);
    assert.equal(actual.status, 'completed', JSON.stringify(actual.results));
    return actual;
  };
  const first = await run();
  const calls = first.results.filter((r: any) => r.call);
  assert.equal(
    calls.length,
    7,
    'duplicate alerts share one investigation; unmatched scope remains an actual call',
  );
  const children = (await server.files.read(method.id)).runs;
  assert.equal(children.length, 7);
  assert.ok(
    children.every(
      (c) =>
        c.definitionId === definitionId && c.parentCall?.runId === first.id,
    ),
  );
  assert.ok(children.every((c) => c.workItem?.id === item.id));
  const rows = (output: string): any[] => {
    const [nodeId, port] = definition.outputs[output];
    return first.results
      .filter((r: any) => r.nodeId === nodeId)
      .flatMap((r: any) => r.outputs[port])
      .map((i: any) => i.value);
  };
  const impact = rows('impact'),
    changes = rows('changes'),
    audit = rows('audit');
  assert.deepEqual(impact.find((r) => r.id === 'api-main-A').alertIds, [
    'scan-01',
    'scan-02-duplicate',
  ]);
  assert.deepEqual(
    audit.map((r) => r.id).sort(),
    alerts.map((a) => a.id).sort(),
  );
  assert.equal(
    audit.length,
    8,
    'every original alert, including duplicates and missing judgment, remains',
  );
  const apiChanges = changes.filter((r) => r.repository === 'api');
  assert.equal(apiChanges.length, 2);
  assert.deepEqual(
    apiChanges
      .find((r) => r.requestedRef === 'main')
      .coverage.map((c: any) => c.cve),
    ['DEMO-A', 'DEMO-B'],
  );
  assert.deepEqual(
    apiChanges
      .find((r) => r.requestedRef === 'release')
      .coverage.map((c: any) => c.baseline),
    ['api-old-release'],
  );
  assert.ok(!impact.some((r) => r.repository === 'platform-images'));
  const upstream = changes.find((r) => r.repository === 'platform-images');
  assert.equal(upstream.coverage[0].repository, 'worker');
  assert.deepEqual(changes.find((r) => r.repository === 'worker').dependsOn, [
    upstream.id,
  ]);
  assert.equal(audit.find((r) => r.id === 'scan-06').disposition, 'excluded');
  assert.equal(audit.find((r) => r.id === 'scan-06').accepted, true);
  assert.equal(
    audit.find((r) => r.id === 'scan-07-missing').conclusion,
    '证据不足',
  );
  assert.equal(audit.find((r) => r.id === 'scan-08-exception').accepted, false);
  assert.deepEqual(rows('completion'), [
    {
      originalAlertCount: 8,
      acceptedCount: 6,
      unresolvedAlertIds: ['scan-07-missing', 'scan-08-exception'],
    },
  ]);
  assert.equal(ws.item.status, 'open');
  assert.ok(ws.item.criteria.every((c: any) => !c.met));
  await action({ action: 'complete' }, 400);

  await action({ action: 'saveUiProgram', source: cveUiProgram });
  for (const output of ['impact', 'changes', 'audit', 'completion'])
    await action({
      action: 'publishDelivery',
      runId: first.id,
      output,
      programId: ws.uiProgram.id,
    });
  assert.equal(ws.deliveries.length, 4);
  for (const delivered of ws.deliveries) {
    assert.equal(delivered.runId, first.id);
    if (delivered.recordContract)
      assert.equal(delivered.rows.length, rows(delivered.output).length);
  }
  const delivery = ws.deliveries.find((d: any) => d.output === 'audit');
  const selected = ['scan-02-duplicate', 'scan-07-missing'];
  const before = ws.item.receivedInputs.length;
  const followup = await server.work.createWork('查看选中的核查记录', []);
  const followupDefinition: Definition = {
    schemaVersion: 1,
    inputs: ['records'],
    nodes: [
      {
        id: 'keep',
        label: '保留选中记录，等待真实补查',
        kind: 'function',

        operation: 'map',
        functionName: 'identity',
      },
    ],
    edges: [{ from: ['$input', 'records'], to: ['keep', 'input'] }],
    outputs: { records: ['keep', 'output'] },
  };
  const followupVersion = await server.flow.saveDraft(
    followup.id,
    undefined,
    followupDefinition,
  );
  await action({
    action: 'continueRecords',
    deliveryId: delivery.id,
    recordIds: selected,
    methodId: followup.id,
    inputPort: 'records',
    methodDefinitionId: followupVersion,
  });
  // A continuation to another method preserves exact old values/sources; it does not execute or change judgments.
  const received = ws.item.receivedInputs.slice(before);
  assert.equal(received.length, 2);
  assert.equal(
    received[0].source.index,
    1,
    'the second expanded duplicate retains its exact output index',
  );
  for (const entry of received) {
    const index = delivery.rows.findIndex((r: any) => r.id === entry.value.id);
    assert.ok(selected.includes(entry.value.id));
    assert.deepEqual(entry.value, delivery.rows[index]);
    assert.deepEqual(entry.source, delivery.sources[index]);
    assert.equal(entry.source.runId, first.id);
  }
  assert.equal(
    (await server.files.read(method.id)).runs.length,
    7,
    'selection does not execute silently',
  );
  assert.equal(
    ws.item.deliveries.length,
    4,
    'selection preserves old fixed deliveries',
  );
  const continued = await run();
  const followupRun = (await server.files.read(followup.id)).runs[0];
  assert.equal(followupRun.definitionId, followupVersion);
  assert.equal(followupRun.parentCall?.runId, continued.id);
  assert.equal(followupRun.inputs.records.length, 2);
  assert.deepEqual(
    followupRun.inputs.records.map((i) => i.value),
    received.map((i: any) => i.value),
  );
  assert.deepEqual(
    followupRun.inputs.records.map((i) => i.source),
    received.map((i: any) => i.source),
  );
  assert.equal(
    ws.item.status,
    'open',
    'successful followup does not accept unresolved judgments',
  );
});

test('recipe rejects cross-ref verification and unconfirmed exceptions, accepts only the explicitly confirmed fixture scope', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'composition-business-boundary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = await createApplication({ dataRoot: root });
  t.after(() => server.runs.close());
  const method = await server.work.createWork('判断依据边界', []);
  const definitionId = await server.flow.saveDraft(
    method.id,
    undefined,
    assessmentMethod,
  );
  const left = {
    ...alerts[0],
    id: alerts[0].relationId,
    alertIds: [alerts[0].id],
  };
  const fixed = structuredClone(assessments[0]);
  const values: Json[] = [
    { left, right: { ...fixed, requestedRef: 'another-ref' } },
    {
      left,
      right: {
        ...fixed,
        verification: { ...fixed.verification, baseline: 'another-baseline' },
      },
    },
    { left, right: { ...fixed, disposition: 'exception', confirmation: '' } },
    {
      left,
      right: {
        ...fixed,
        disposition: 'exception',
        confirmation: 'fixture:user-confirmation:api-main-A-only',
      },
    },
  ];
  const runId = await server.runs.start(method.id, {
    definitionId,
    scope: 'full',
    inputs: {
      input: values.map((value, index) => ({
        value,
        sampleId: `${index}`,
        materialIds: [],
        sourceResultIds: [],
      })),
    },
  });
  await server.runs.wait(runId);
  const run = (await server.files.read(method.id)).runs.find(
    (r) => r.id === runId,
  )!;
  assert.equal(run.status, 'completed');
  const rows = run.results
    .flatMap((r) => r.outputs.output)
    .map((i) => i.value as Record<string, Json>);
  assert.deepEqual(
    rows.map((r) => r.accepted),
    [false, false, false, true],
  );
  assert.equal(rows[0].conclusion, '证据不足');
  assert.deepEqual(rows[0].changes, []);
});
