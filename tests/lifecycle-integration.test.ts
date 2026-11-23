import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../src/server/index.ts';
import type {
  Definition,
  Json,
  NodeExecution,
  Run,
  WorkItemView,
  ItemInputSelection,
} from '../src/shared/records.ts';

const investigation = (waitSeconds?: number): Definition => ({
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [
    {
      id: 'investigate',
      label: '调查真实证据',
      kind: 'agent',
      operation: 'map',
      task: 'Explicit fixture extracts evidence',
      expectedOutput: {
        type: 'object',
        required: ['evidence'],
        properties: { evidence: { type: 'string' } },
        additionalProperties: false,
      },
    },
    {
      id: 'investigated',
      label: '记录调查',
      kind: 'milestone',
      milestone: { stage: '已调查', summary: '实际调查结果已保存' },
    },
    ...(waitSeconds === undefined
      ? []
      : [
          {
            id: 'wait',
            label: '等待公告',
            kind: 'wait' as const,
            wait: {
              event: 'advisory',
              reason: '等待明确公告',
              ...(waitSeconds ? { timeoutSeconds: waitSeconds } : {}),
            },
          },
        ]),
    {
      id: 'reviewed',
      label: '复核完成',
      kind: 'milestone',
      milestone: { stage: '待人工确认', summary: '本轮结束，仍需条件依据' },
    },
  ],
  edges: [],
  outputs: { result: ['reviewed', 'output'] },
});
function flow(waitSeconds?: number) {
  const d = investigation(waitSeconds);
  d.edges = d.nodes.map((n, index) => ({
    from:
      index === 0 ? ['$input', 'materials'] : [d.nodes[index - 1].id, 'output'],
    to: [n.id, 'input'],
  }));
  return d;
}
const evidence = async (c: NodeExecution): Promise<Json> => ({
  evidence: String(Object.values(c.inputs).flat()[0].value),
});
async function fixture(
  t: TestContext,
  executeNode: (c: NodeExecution) => Promise<Json> = evidence,
) {
  const root = await mkdtemp(join(tmpdir(), 'lifecycle-unified-'));
  let app = await createApplication({ dataRoot: root, executeNode });
  t.after(async () => {
    app.runs.close();
    app.batches.close();
    await rm(root, { recursive: true, force: true });
  });
  async function act(
    id: string,
    action: string,
    fields: Record<string, unknown> = {},
    expected = 200,
  ) {
    const item = await app.items.get(id);
    const response = await app.app.request(`/api/items/${id}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, baseRevision: item.revision, ...fields }),
    });
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    return body as WorkItemView;
  }
  async function workspace(
    id: string,
    action: string,
    fields: Record<string, unknown> = {},
  ) {
    const item = await app.items.get(id);
    const response = await app.app.request(
      `/api/items/${id}/workspace/actions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          baseRevision: item.revision,
          ...fields,
        }),
      },
    );
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  async function create(definition = flow(), materials = ['本项原始证据']) {
    const item = await app.items.create({
      title: '持续事项',
      goal: '按真实依据推进',
      materials,
      criteria: ['完成依据已核对'],
    });
    await workspace(item.id, 'saveFlow', { definition });
    await workspace(item.id, 'bindInputs', {
      inputBindings: {
        [definition.inputs[0]]: item.materials.map((m) => ({
          kind: 'material',
          materialId: m.id,
        })),
      },
    });
    return app.items.get(item.id);
  }
  async function until(id: string, status: string) {
    for (let n = 0; n < 400; n++) {
      const item = await app.items.get(id);
      if (item.execution?.status === status) return item;
      await delay(10);
    }
    throw Error(
      `未到达 ${status}: ${JSON.stringify((await app.items.get(id)).execution)}`,
    );
  }
  const readRun = async (item: WorkItemView) => {
    const ref = item.runs.at(-1)!;
    return (await app.files.read(ref.workId)).runs.find(
      (r) => r.id === ref.runId,
    )!;
  };
  async function run(id: string, status = 'completed') {
    await act(id, 'run');
    return until(id, status);
  }
  async function restart() {
    app.runs.close();
    app.batches.close();
    app = await createApplication({ dataRoot: root, executeNode });
  }
  return {
    get app() {
      return app;
    },
    root,
    act,
    workspace,
    create,
    until,
    run,
    readRun,
    restart,
  };
}

test('L1/L5 independent items use independent frozen inputs; milestones and Run completion never close business', async (t) => {
  const f = await fixture(t),
    a = await f.create(flow(), ['甲证据']),
    b = await f.create(flow(), ['乙证据']);
  assert.notEqual(a.workId, b.workId);
  const av = await f.run(a.id),
    bv = await f.run(b.id);
  assert.equal(av.status, 'open');
  assert.equal(bv.status, 'open');
  assert.equal(av.history.filter((h) => h.kind === 'milestone').length, 2);
  assert.equal((await f.readRun(av)).inputs.materials[0].value, '甲证据');
  assert.equal((await f.readRun(bv)).inputs.materials[0].value, '乙证据');
  await f.act(a.id, 'complete', {}, 400);
  await f.act(a.id, 'criteria', {
    criteria: av.criteria.map((c) => ({
      ...c,
      met: true,
      evidence: '人工核对真实成果',
    })),
  });
  const completed = await f.act(a.id, 'complete');
  assert.equal(completed.status, 'completed');
  assert.equal((await f.app.items.get(b.id)).status, 'open');
  const response = await f.app.app.request(`/api/items/${a.id}`);
  assert.equal((await response.json()).status, 'completed');
});

test('L2 a persisted wait resumes the original Run after restart without repeating completed agents or milestones', async (t) => {
  let calls = 0;
  const f = await fixture(t, async (c) => {
      calls++;
      return evidence(c);
    }),
    item = await f.create(flow(0));
  const waiting = await f.run(item.id, 'waiting'),
    before = await f.readRun(waiting);
  assert.equal(calls, 1);
  assert.equal(waiting.history.filter((h) => h.kind === 'milestone').length, 1);
  await f.restart();
  assert.equal((await f.app.items.get(item.id)).execution!.runId, before.id);
  await f.act(item.id, 'signal', { id: 'wrong', name: 'other' }, 400);
  await f.act(item.id, 'signal', {
    id: 'one',
    name: 'advisory',
    payload: { fixed: 'original' },
  });
  const done = await f.until(item.id, 'completed');
  assert.equal(done.runs.length, 1);
  assert.equal((await f.readRun(done)).id, before.id);
  assert.equal(calls, 1);
  await f.act(item.id, 'signal', {
    id: 'one',
    name: 'advisory',
    payload: { fixed: 'original' },
  });
  assert.equal(
    (await f.app.items.get(item.id)).history.filter(
      (h) => h.kind === 'milestone',
    ).length,
    2,
  );
});

test('L3 offline deadlines release the old wait; stopping another wait rejects late messages', async (t) => {
  const f = await fixture(t),
    timed = await f.create(flow(0.08));
  const waiting = await f.run(timed.id, 'waiting'),
    fixed = waiting.runs.at(-1)!.runId;
  f.app.runs.close();
  await delay(120);
  await f.restart();
  assert.equal(
    (await f.until(timed.id, 'completed')).runs.at(-1)!.runId,
    fixed,
  );
  const stop = await f.create(flow(0));
  await f.run(stop.id, 'waiting');
  await f.act(stop.id, 'stop');
  const cancelled = await f.until(stop.id, 'cancelled');
  const count = cancelled.history.filter((h) => h.kind === 'milestone').length;
  await f.act(stop.id, 'signal', { id: 'late', name: 'advisory' }, 400);
  assert.equal(
    (await f.app.items.get(stop.id)).history.filter(
      (h) => h.kind === 'milestone',
    ).length,
    count,
  );
});

test('L4 malformed output blocks downstream; corrected inputs or definitions create a new Run and preserve old facts', async (t) => {
  let bad = true;
  const f = await fixture(t, async (c) => (bad ? {} : evidence(c))),
    item = await f.create();
  const failed = await f.run(item.id, 'failed'),
    old = await f.readRun(failed);
  assert.equal(
    failed.history.some((h) => h.kind === 'milestone'),
    false,
  );
  assert.deepEqual(old.results[0].outputs, {});
  bad = false;
  await f.app.items.addEvidence(item.id, ['新证据']);
  await f.workspace(item.id, 'bindInputs', {
    inputBindings: { materials: [{ kind: 'material', materialId: 'M02' }] },
  });
  const done = await f.run(item.id),
    next = await f.readRun(done);
  assert.notEqual(next.id, old.id);
  assert.equal(next.inputs.materials[0].value, '新证据');
  assert.deepEqual(
    (await f.app.files.read(item.workId)).runs.find((r) => r.id === old.id),
    old,
  );
});

test('H6/H11 event identity spans runs: replaying an old signal does not release a new wait', async (t) => {
  const f = await fixture(t),
    item = await f.create(flow(0));
  await f.run(item.id, 'waiting');
  await f.act(item.id, 'signal', { id: 'stable-event', name: 'advisory' });
  await f.until(item.id, 'completed');
  await f.run(item.id, 'waiting');
  await f.act(item.id, 'signal', { id: 'stable-event', name: 'advisory' });
  assert.equal((await f.app.items.get(item.id)).execution!.status, 'waiting');
  await f.act(item.id, 'signal', { id: 'new-event', name: 'advisory' });
  assert.equal((await f.until(item.id, 'completed')).runs.length, 2);
});

test('explicit material bindings freeze Agent context and later evidence never rewrites a running input', async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    seen: NodeExecution[] = [];
  const f = await fixture(t, async (c) => {
      seen.push(c);
      await gate;
      return evidence(c);
    }),
    item = await f.create(flow(), ['甲', '乙', '丙']);
  await f.workspace(item.id, 'bindInputs', {
    inputBindings: { materials: [{ kind: 'material', materialId: 'M02' }] },
  });
  await f.act(item.id, 'run');
  for (let n = 0; n < 100 && !seen.length; n++) await delay(5);
  assert.equal(seen.length, 1);
  assert.deepEqual(
    seen[0].materials.map((m) => m.text),
    ['乙'],
  );
  await f.app.items.addEvidence(item.id, ['后来资料']);
  release();
  const done = await f.until(item.id, 'completed'),
    run = await f.readRun(done);
  assert.equal(run.inputs.materials.length, 1);
  assert.equal(run.inputs.materials[0].value, '乙');
  assert.deepEqual(
    run.materials.map((m) => m.text),
    ['乙'],
  );
});

test('invalid input contracts fail before launch and leave the saved binding and execution history unchanged', async (t) => {
  const f = await fixture(t),
    item = await f.create();
  const before = await f.app.items.get(item.id);
  const response = await f.app.app.request(
    `/api/items/${item.id}/workspace/actions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'bindInputs',
        baseRevision: before.revision,
        inputBindings: { unknown: [{ kind: 'material', materialId: 'M01' }] },
      }),
    },
  );
  assert.equal(response.status, 400);
  const after = await f.app.items.get(item.id);
  assert.deepEqual(after.inputBindings, before.inputBindings);
  assert.deepEqual(after.runs, before.runs);
  assert.equal(after.revision, before.revision);
});

test('a static single-step selection is a private full commit fragment; ordinary preview never submits milestones', async (t) => {
  const seen: string[] = [];
  const f = await fixture(t, async (c) => {
    seen.push(c.node.id);
    return evidence(c);
  });
  const method = await f.app.work.createWork('可复用方法', []),
    version = await f.app.flow.saveDraft(method.id, undefined, flow());
  const item = await f.app.items.create({
    title: '单步',
    goal: '只处理调查',
    materials: ['证据'],
  });
  await f.workspace(item.id, 'useMethod', {
    methodId: method.id,
    definitionId: version,
    scope: { nodeId: 'investigate' },
    inputBindings: { input: [{ kind: 'material', materialId: 'M01' }] },
  });
  const done = await f.run(item.id),
    run = await f.readRun(done);
  assert.deepEqual(seen, ['investigate']);
  assert.equal(run.scope, 'full');
  assert.equal(run.effectMode, 'commit');
  assert.equal(
    done.history.some((h) => h.kind === 'milestone'),
    false,
  );
  const all = await f.create(),
    prepared = await f.app.items.prepare(all.id);
  assert.deepEqual(prepared.issues, []);
  const previewId = await f.app.runs.start(all.workId, {
    definitionId: prepared.definitionId!,
    scope: 'full',
    inputs: prepared.inputs!,
    materials: all.materials,
    workItem: all,
    effectMode: 'preview',
  });
  await f.app.runs.wait(previewId);
  assert.equal(
    (await f.app.items.get(all.id)).history.some((h) => h.kind === 'milestone'),
    false,
  );
  assert.equal((await f.app.items.get(all.id)).runs.length, 0);
});

test('completion criteria edits invalidate confirmation while reopening preserves prior evidence and history', async (t) => {
  const f = await fixture(t),
    item = await f.create();
  await f.run(item.id);
  let current = await f.app.items.get(item.id);
  await f.act(item.id, 'criteria', {
    criteria: current.criteria.map((c) => ({
      ...c,
      met: true,
      evidence: '具体人工依据',
    })),
  });
  await f.act(item.id, 'complete');
  await f.act(item.id, 'reopen', { reason: '新证据推翻结论' });
  current = await f.app.items.get(item.id);
  assert.equal(current.id, item.id);
  assert.equal(current.criteria[0].met, false);
  assert.equal(current.criteria[0].evidence, '具体人工依据');
  assert.ok(
    current.history.some(
      (h) =>
        h.kind === 'completed' && h.criteria?.[0].evidence === '具体人工依据',
    ),
  );
  const renamed = await f.act(item.id, 'criteria', {
    criteria: current.criteria.map((c) => ({
      ...c,
      text: '修改后的条件',
      met: true,
    })),
  });
  assert.equal(renamed.criteria[0].met, false);
  assert.equal(renamed.criteria[0].evidence, '');
});

test('two explicit versions of one sample cannot be merged, but distinct outputs sharing material remain independent', async (t) => {
  const f = await fixture(t),
    item = await f.create();
  const first = await f.readRun(await f.run(item.id)),
    second = await f.readRun(await f.run(item.id));
  const source = (run: Run): ItemInputSelection => ({
    kind: 'result',
    source: {
      workId: item.workId,
      runId: run.id,
      resultId: run.results.find((r) => r.nodeId === 'investigate')!.id,
      port: 'output',
      index: 0,
    },
  });
  const result = await f.app.items.prepare(item.id, {
    inputBindings: { materials: [source(first), source(second)] },
  });
  assert.match(result.issues.join(), /多个版本/);
  const distinct = await f.app.items.prepare(item.id, {
    inputBindings: {
      materials: [
        source(first),
        {
          kind: 'result',
          source: {
            workId: item.workId,
            runId: first.id,
            resultId: first.results.find((r) => r.nodeId === 'reviewed')!.id,
            port: 'output',
            index: 0,
          },
        },
      ],
    },
  });
  assert.deepEqual(distinct.issues, []);
  assert.equal(distinct.inputs!.materials.length, 2);
});
