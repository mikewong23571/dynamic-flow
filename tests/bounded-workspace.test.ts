import { validateInputs } from '../src/server/runs/index.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index.ts';
import { interfaceFixture } from './interface-fixture.ts';
import {
  exceedsInlineBudget,
  contentPage,
} from '../src/server/flow/overview.ts';

test('size checks stop early and content pages have bounded retained text', () => {
  assert.equal(exceedsInlineBudget({ name: 'small' }), false);
  assert.equal(exceedsInlineBudget({ name: 'x'.repeat(40_000) }), true);
  assert.deepEqual(contentPage('x'.repeat(40_003), 40_000), {
    text: 'xxx',
    offset: 40_000,
    characters: 40_003,
    hasMore: false,
  });
});
test('large frozen values and tool bodies are read only by exact reference, without rewriting runs', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bounded-workspace-'));
  const app = await createApplication({ dataRoot: root });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });
  const work = await app.work.createWork('large saved history', []);
  const definition = await app.flow.saveDraft(work.id, undefined, {
    schemaVersion: 1,
    inputs: ['input'],
    nodes: [],
    edges: [],
    outputs: {},
  });
  const item = {
    sampleId: 's',
    materialIds: [],
    sourceResultIds: [],
    value: { evidence: 'exact '.repeat(20_000) },
  };
  await app.files.change(work.id, (w) => {
    w.runs.push({
      materials: [],
      id: 'wanted',
      definitionId: definition,
      scope: 'full',
      inputs: { input: [item] },
      status: 'completed',
      stopRequested: false,
      nodeStates: {},
      startedAt: '2026-10-30',
      results: [
        {
          id: 'result',
          runId: 'wanted',
          definitionId: definition,
          nodeId: 'n',
          instanceId: 'one',
          input: { input: [item] },
          outputs: { output: [item] },
          status: 'completed',
          activities: [],
          startedAt: '2026-10-30',
        },
      ],
    });
    w.runs.push({ ...w.runs[0], id: 'unrequested' });
    w.messages.push({
      id: 'message',
      role: 'assistant',
      text: 'read evidence',
      activities: [
        {
          id: 'activity',
          toolCallId: 'call',
          toolName: 'read',
          status: 'completed',
          result: item.value,
        },
      ],
    });
  });
  const path = join(root, work.id, 'work.json');
  const before = await readFile(path, 'utf8');
  const response = await app.app.request(`/api/works/${work.id}?runIds=wanted`);
  const text = await response.text(),
    snapshot = JSON.parse(text);
  assert.ok(text.length < 12_000, `overview must be bounded: ${text.length}`);
  assert.deepEqual(
    snapshot.work.runs.map((r: any) => r.id),
    ['wanted'],
  );
  const projected = snapshot.work.runs[0].results[0].outputs.output[0];
  assert.equal(projected.value, null);
  assert.ok(projected.contentUrl);
  assert.deepEqual(projected.valueFields, ['evidence']);
  assert.throws(
    () => validateInputs({ input: [projected] }, ['input']),
    /输入正文尚未加载/,
  );
  const page = (await (
    await app.app.request(projected.contentUrl)
  ).json()) as any;
  assert.equal(page.text.length, 20_000);
  assert.equal(page.hasMore, true);
  const original = await (
    await app.app.request(projected.contentUrl + '&download=true')
  ).json();
  assert.deepEqual(original, item.value);
  const tool = snapshot.work.messages[0].activities[0];
  assert.equal(tool.result, undefined);
  const activity = (await (
    await app.app.request(tool.contentUrl + '&download=true')
  ).json()) as any;
  assert.deepEqual(activity.result, item.value);
  const missing = await app.app.request(
    projected.contentUrl.replace('resultId=result', 'resultId=missing'),
  );
  assert.notEqual(missing.status, 200);
  assert.equal(await readFile(path, 'utf8'), before);
});
test('workspace input previews are explicit and full original material remains available to Assistant', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bounded-item-'));
  const app = await createApplication({ dataRoot: root });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });
  const fixture = await interfaceFixture(app);
  const id = fixture.item.id;
  await app.items.addEvidence(id, ['exact '.repeat(15_000)]);
  const ws = (await (
    await app.app.request(`/api/items/${id}/workspace`)
  ).json()) as any;
  const material = ws.item.materials.at(-1)!;
  assert.ok(material.contentUrl);
  assert.ok(material.text.length < 1000);
  const raw = await app.items.get(id);
  assert.equal(raw.materials.at(-1)!.text, 'exact '.repeat(15_000).trim());
  const full = await (
    await app.app.request(material.contentUrl! + '&download=true')
  ).json();
  assert.equal(full, raw.materials.at(-1)!.text);
});

test('run-only writes are serialized with work edits and failed edits never mutate the cached original', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'scoped-write-'));
  const app = await createApplication({ dataRoot: root });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });
  const work = await app.work.createWork('scope writes', []);
  const run = {
    materials: [],
    id: 'r',
    definitionId: 'd',
    scope: 'full' as const,
    inputs: {},
    status: 'running' as const,
    stopRequested: false,
    nodeStates: {},
    results: [],
    startedAt: 'now',
  };
  await app.files.change(work.id, (w) => {
    w.runs.push(run, { ...run, id: 'other' });
  });
  await assert.rejects(
    app.files.changeRun(work.id, 'r', (r) => {
      r.error = 'unsaved';
      throw Error('failed edit');
    }),
    /failed edit/,
  );
  assert.equal((await app.files.read(work.id)).runs[0].error, undefined);
  await Promise.all([
    app.files.changeRun(work.id, 'r', (r) => {
      r.error = 'saved';
    }),
    app.files.change(work.id, (w) => {
      w.title = 'concurrent title';
    }),
    app.files.changeRun(work.id, 'r', (r) => {
      r.status = 'completed';
    }),
  ]);
  const saved = await app.files.read(work.id);
  assert.equal(saved.title, 'concurrent title');
  assert.equal(saved.runs[0].error, 'saved');
  assert.equal(saved.runs[0].status, 'completed');
  assert.deepEqual(saved.runs[1], { ...run, id: 'other' });
});

test('large delivery lists omit hidden bodies while record detail returns the exact fixed record', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bounded-delivery-'));
  const app = await createApplication({ dataRoot: root });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });
  const fixture = await interfaceFixture(app);
  let ws = await fixture.post(
    `/api/items/${fixture.item.id}/workspace/actions`,
    { action: 'run', baseRevision: fixture.ws.item.revision },
  );
  const workId = ws.work.work.id,
    runId = ws.work.work.runs.at(-1).id;
  for (let i = 0; i < 100; i++) {
    const status = await app.files.select(
      workId,
      (w) => w.runs.find((r) => r.id === runId)?.status,
    );
    if (status === 'completed') break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  ws = (await (
    await app.app.request(`/api/items/${fixture.item.id}/workspace`)
  ).json()) as any;
  ws = await fixture.post(`/api/items/${fixture.item.id}/workspace/actions`, {
    action: 'publishDelivery',
    output: 'records',
    baseRevision: ws.item.revision,
    programId: ws.uiProgram.id,
    runId,
  });
  const selected = ws.deliveries.find((d: any) => !!d.recordContract);
  await app.files.change(workId, (w) => {
    const result = w.runs
      .find((r) => r.id === runId)!
      .results.find((r) => r.outputs.records)!;
    (result.outputs.records[0].value as Record<string, any>).largeEvidence =
      'evidence '.repeat(20_000);
  });
  ws = (await (
    await app.app.request(`/api/items/${fixture.item.id}/workspace`)
  ).json()) as any;
  const delivery = ws.deliveries.find((d: any) => d.id === selected.id);
  assert.equal(delivery.recordsOmitted, true);
  assert.equal(delivery.rows[0].largeEvidence, undefined);
  const detail = (await (
    await app.app.request(
      `/api/items/${fixture.item.id}/deliveries/${selected.id}/records/R1`,
    )
  ).json()) as any;
  assert.equal(detail.value.largeEvidence.length, 180_000);
  assert.equal(detail.value.id, 'R1');
});

test('browser overview mode also bounds action responses and SSE snapshots', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bounded-events-'));
  const app = await createApplication({ dataRoot: root });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });
  const work = await app.work.createWork('events overview', []);
  await app.files.change(work.id, (w) => {
    w.messages.push({
      id: 'm',
      role: 'assistant',
      text: 'saved',
      activities: [
        {
          id: 'a',
          toolCallId: 'c',
          toolName: 'read',
          status: 'completed',
          result: 'x'.repeat(100_000),
        },
      ],
    });
  });
  const action = await app.app.request(
    `/api/works/${work.id}/actions?view=overview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rename', title: 'updated' }),
    },
  );
  assert.equal(action.status, 200);
  assert.ok((await action.text()).length < 5000);
  const controller = new AbortController();
  const response = await app.app.request(
    `/api/works/${work.id}/events?view=overview`,
    { signal: controller.signal },
  );
  const reader = response.body!.getReader();
  try {
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.ok(first.includes('snapshot'));
    assert.ok(first.length < 5000);
    assert.ok(first.includes('contentUrl'));
  } finally {
    controller.abort();
    await reader.cancel();
  }
});
