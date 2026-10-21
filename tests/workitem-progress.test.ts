import test, { type TestContext } from 'node:test';
import { seedCatalog } from './catalog-fixture.ts';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index.ts';
import { createFiles } from '../src/server/files/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createWorkItems } from '../src/server/work-items/index.ts';
import type { Definition, Run, WorkItemView } from '../src/shared/records.ts';

const definition: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  nodes: [
    {
      id: 'investigate',
      label: '调查',
      kind: 'agent',
      mode: 'all',
      task: '调查',
      contract: {
        responsibility: '核对公告',
        done: '得出结论',
        rationale: '查明范围',
      },
    },
  ],
  edges: [{ from: ['$input', 'input'], to: ['investigate', 'input'] }],
  outputs: { output: ['investigate', 'output'] },
};
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'item-progress-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = createFiles(root),
    items = createWorkItems(root, files);
  const work = await createWorkService(files).createWork('调查方法', []);
  const definitionId = await files.writeDefinition(work.id, definition);
  await files.change(work.id, (w) => {
    w.definitionIds.push(definitionId);
    w.adoptedId = definitionId;
  });
  const create = (key: string) =>
    items.create({
      key,
      title: key,
      goal: '确认范围',
      workflowId: work.id,
      materials: ['原始公告'],
      criteria: ['核验'],
    });
  const launch = (item: WorkItemView, runId = 'run-1') =>
    items.launch(item.id, async (input) => {
      const run: Run = {
        id: runId,
        definitionId,
        scope: 'full',
        inputs: {},
        workItem: input,
        effectMode: 'commit',
        status: 'running',
        stopRequested: false,
        nodeStates: { investigate: 'running' },
        results: [
          {
            id: 'result-' + runId,
            runId,
            definitionId,
            nodeId: 'investigate',
            instanceId: 'instance',
            input: {},
            outputs: {},
            status: 'running',
            activities: [],
            startedAt: new Date().toISOString(),
          },
        ],
        startedAt: new Date().toISOString(),
      };
      await files.change(work.id, (w) => {
        w.runs.push(run);
      });
      return { workId: work.id, runId, definitionId };
    });
  return { root, files, items, work, definitionId, create, launch };
}

test('global summary precedes search/pending filters and follows completion/reopening', async (t) => {
  const f = await fixture(t);
  const states = [
    'open',
    'open',
    'running',
    'running',
    'running',
    'waiting',
    'failed',
    'cancelled',
    'completed',
    'completed',
  ];
  for (const [i, state] of states.entries()) {
    let item = await f.create('CASE-' + i);
    if (state === 'completed') {
      await f.items.criteria(
        item.id,
        item.criteria.map((c) => ({ ...c, met: true, evidence: '原始公告' })),
      );
      await f.items.complete(item.id);
    } else if (state !== 'open') {
      await f.launch(item, 'run-' + i);
      await f.files.change(f.work.id, (w) => {
        w.runs.find((r) => r.id === 'run-' + i)!.status =
          state as Run['status'];
      });
    }
  }
  const expected = {
    total: 10,
    pending: 8,
    open: 2,
    running: 3,
    waiting: 1,
    attention: 2,
    completed: 2,
  };
  const all = await f.items.list();
  assert.deepEqual(all.summary, expected);
  assert.equal((await f.items.list({ status: 'pending' })).total, 8);
  const none = await f.items.list({ query: 'missing', status: 'pending' });
  assert.equal(none.total, 0);
  assert.deepEqual(none.summary, expected);
  const completed = all.items.find((i) => i.status === 'completed')!;
  await f.items.reopen(completed.id, '新信息');
  assert.equal((await f.items.list()).summary.pending, 9);
});

test('external progress persists, keeps exact history, deduplicates and checks revision/materials', async (t) => {
  const f = await fixture(t),
    item = await f.create('CASE');
  const report = {
    id: 'external-1',
    expectedRevision: item.revision,
    stage: '影响调查',
    summary: '已整理公告',
    nextAction: '补充版本范围',
    blocker: '缺少范围',
    materialIds: ['M01'],
  };
  const saved = await f.items.reportProgress(item.id, report);
  assert.equal(saved.effectiveStatus, 'attention');
  assert.equal(saved.status, 'open');
  assert.equal(saved.criteria[0].met, false);
  const retried = await f.items.reportProgress(item.id, report);
  assert.equal(retried.revision, saved.revision);
  assert.equal(retried.progressAt, saved.progressAt);
  assert.deepEqual(retried.history, saved.history);
  const history = saved.history.at(-1)!;
  assert.equal(history.origin, 'external');
  assert.deepEqual(history.progress, {
    stage: report.stage,
    nextAction: report.nextAction,
    blocker: report.blocker,
  });
  await assert.rejects(
    f.items.reportProgress(item.id, { ...report, summary: '不同' }),
    /ID/,
  );
  await assert.rejects(
    f.items.reportProgress(item.id, { ...report, id: 'late' }),
    /版本|revision/,
  );
  await assert.rejects(
    f.items.reportProgress(item.id, {
      ...report,
      id: 'wrong',
      expectedRevision: saved.revision,
      materialIds: ['M99'],
    }),
    /材料/,
  );
  await assert.rejects(
    f.items.reportProgress(item.id, {
      ...report,
      id: 'empty',
      expectedRevision: saved.revision,
      stage: ' ',
    }),
    /阶段/,
  );
  const reopened = await createWorkItems(f.root, createFiles(f.root)).get(
    item.id,
  );
  assert.equal(reopened.nextAction, report.nextAction);
  assert.equal(reopened.blocker, report.blocker);
  const next = await f.items.reportProgress(item.id, {
    id: 'clear',
    expectedRevision: saved.revision,
    stage: '复核',
    summary: '范围已补充',
  });
  assert.equal(next.nextAction, undefined);
  assert.equal(next.blocker, undefined);
  assert.equal(next.effectiveStatus, 'open');
});

test('formal reports bind current ordinary instance, reject late writes and preserve runtime priority', async (t) => {
  const f = await fixture(t),
    item = await f.create('CASE');
  await f.items.reportProgress(item.id, {
    id: 'before',
    expectedRevision: 0,
    stage: '调查',
    summary: '准备',
    blocker: '旧阻碍',
    nextAction: '旧动作',
  });
  const launched = await f.launch(await f.items.get(item.id));
  assert.equal(launched.blocker, undefined);
  assert.equal(launched.nextAction, undefined);
  assert.deepEqual(launched.execution?.activeNodes, [
    { id: 'investigate', label: '调查', responsibility: '核对公告' },
  ]);
  const source = {
    workId: f.work.id,
    runId: 'run-1',
    definitionId: f.definitionId,
    nodeId: 'investigate',
    instanceId: 'instance',
  };
  const report = {
    id: 'agent-1',
    stage: '调查',
    summary: '尚缺版本',
    blocker: '版本范围',
    source,
  };
  await f.items.addEvidence(item.id, ['新一条证据，未进入本轮输入']);
  await assert.rejects(
    f.items.reportProgress(item.id, {
      ...report,
      id: 'late-material',
      materialIds: ['M02'],
    }),
    /材料/,
  );
  await f.files.change(f.work.id, (w) => {
    w.runs[0].results[0].purpose = 'planning';
  });
  await assert.rejects(
    f.items.reportProgress(item.id, { ...report, id: 'planning' }),
    /来源|实例/,
  );
  await f.files.change(f.work.id, (w) => {
    delete w.runs[0].results[0].purpose;
  });
  await assert.rejects(
    f.items.reportProgress(item.id, {
      id: 'external',
      expectedRevision: launched.revision,
      stage: '错误',
      summary: '迟到',
    }),
    /未结束|未决/,
  );
  await assert.rejects(
    f.items.reportProgress(item.id, {
      ...report,
      source: { ...source, instanceId: 'wrong' },
    }),
    /来源|实例/,
  );
  const saved = await f.items.reportProgress(item.id, report);
  assert.equal(saved.effectiveStatus, 'running');
  assert.equal(saved.history.at(-1)?.origin, 'agent');
  await f.files.change(f.work.id, (w) => {
    w.runs[0].status = 'waiting';
    w.runs[0].waits = [
      {
        nodeId: 'investigate',
        event: 'versions',
        reason: '补版本',
        status: 'pending',
      },
    ];
  });
  assert.equal((await f.items.get(item.id)).effectiveStatus, 'waiting');
  await f.files.change(f.work.id, (w) => {
    w.runs[0].status = 'failed';
    w.runs[0].error = 'schema 失败';
  });
  const failed = await f.items.get(item.id);
  assert.equal(failed.effectiveStatus, 'attention');
  assert.equal(failed.execution?.error, 'schema 失败');
  await assert.rejects(
    f.items.reportProgress(item.id, { ...report, id: 'late' }),
    /结束|停止/,
  );
  await f.launch(failed, 'run-2');
  await assert.rejects(
    f.items.reportProgress(item.id, { ...report, id: 'old' }),
    /当前|来源/,
  );
  await f.files.change(f.work.id, (w) => {
    w.runs[1].stopRequested = true;
  });
  await assert.rejects(
    f.items.reportProgress(item.id, {
      ...report,
      id: 'stopped',
      source: { ...source, runId: 'run-2' },
    }),
    /停止/,
  );
});

test('HTTP report action returns current view and global summary, survives application restart', async (t) => {
  const f = await fixture(t),
    item = await f.create('HTTP');
  const first = await createApplication({ dataRoot: f.root });
  t.after(() => first.runs.close());
  const response = await first.app.request(
    '/api/items/' + item.id + '/actions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reportProgress',
        id: 'http',
        expectedRevision: 0,
        stage: '调查',
        summary: '已整理',
        blocker: '缺版本',
      }),
    },
  );
  assert.equal(response.status, 200, await response.clone().text());
  const body = (await response.json()) as WorkItemView;
  assert.equal(body.blocker, '缺版本');
  assert.equal(
    (await (await first.app.request('/api/items?query=missing')).json()).summary
      .attention,
    1,
  );
  first.runs.close();
  const second = await createApplication({ dataRoot: f.root });
  t.after(() => second.runs.close());
  assert.equal(
    (await (await second.app.request('/api/items/' + item.id)).json()).stage,
    '调查',
  );
});

test('active nodes project every parallel and saved expanded step from frozen definition', async (t) => {
  const f = await fixture(t),
    item = await f.create('EXPANDED');
  const dynamic: Definition = {
    ...definition,
    nodes: [
      {
        id: 'plan',
        label: '调查责任',
        kind: 'dynamic',
        mode: 'all',
        task: '规划',
        dynamic: { boundary: '调查', maxNodes: 4 },
      },
      { ...definition.nodes[0], id: 'parallel', label: '并行核验' },
    ],
    edges: [
      { from: ['$input', 'input'], to: ['plan', 'input'] },
      { from: ['$input', 'input'], to: ['parallel', 'input'] },
    ],
    outputs: { output: ['plan', 'output'] },
  };
  const fixed = await f.files.writeDefinition(f.work.id, dynamic);
  await f.files.change(f.work.id, (w) => {
    w.definitionIds.push(fixed);
  });
  await f.launch(item);
  await f.files.change(f.work.id, (w) => {
    const run = w.runs[0];
    run.definitionId = fixed;
    run.nodeStates = {
      plan: 'queued',
      'plan/investigate': 'running',
      parallel: 'running',
    };
    run.expansions = [
      {
        nodeId: 'plan',
        definition,
        resultId: 'plan-result',
        createdAt: run.startedAt,
      },
    ];
  });
  // Ref remains the same immutable identity as the run definition.
  const path = join(f.root, 'work-items', item.id + '.json');
  const { writeFile } = await import('node:fs/promises');
  const saved = JSON.parse(await readFile(path, 'utf8'));
  saved.runs[0].definitionId = fixed;
  await writeFile(path, JSON.stringify(saved));
  const view = await f.items.get(item.id);
  assert.deepEqual(view.execution?.activeNodes, [
    { id: 'parallel', label: '并行核验', responsibility: '核对公告' },
    {
      id: 'plan/investigate',
      label: '调查',
      responsibility: '核对公告',
      parentLabel: '调查责任',
    },
  ]);
  assert.equal(view.progressAt, item.progressAt);
  assert.equal((await f.items.get(item.id)).revision, view.revision);
});

test('milestones, new methods and reopening clear stale instructions; save failures propagate', async (t) => {
  const f = await fixture(t),
    item = await f.create('RESET');
  await f.items.reportProgress(item.id, {
    id: 'first',
    expectedRevision: 0,
    stage: '分析',
    summary: '待补证',
    nextAction: '旧动作',
    blocker: '旧阻碍',
  });
  await f.launch(await f.items.get(item.id));
  const run = (await f.files.read(f.work.id)).runs[0];
  await f.items.reportProgress(item.id, {
    id: 'during',
    stage: '分析',
    summary: '当前阻碍',
    nextAction: '动作',
    blocker: '阻碍',
    source: {
      workId: f.work.id,
      runId: run.id,
      definitionId: run.definitionId,
      nodeId: 'investigate',
      instanceId: 'instance',
    },
  });
  await f.items.milestone(
    f.work.id,
    run,
    {
      id: 'milestone',
      label: '里程碑',
      kind: 'milestone',
      mode: 'all',
      milestone: { stage: '复核', summary: '完成分析' },
    },
    {},
  );
  let view = await f.items.get(item.id);
  assert.equal(view.blocker, undefined);
  assert.equal(view.nextAction, undefined);
  assert.equal(view.history.filter((h) => h.kind === 'progress').length, 2);
  await f.files.change(f.work.id, (w) => {
    w.runs[0].status = 'completed';
  });
  await f.items.reportProgress(item.id, {
    id: 'idle',
    expectedRevision: view.revision,
    stage: '复核',
    summary: '待确认',
    nextAction: '确认',
    blocker: '缺确认',
  });
  const other = await createWorkService(f.files).createWork('新方法', []);
  view = await f.items.method(item.id, other.id);
  assert.equal(view.blocker, undefined);
  assert.equal(view.nextAction, undefined);
  await f.items.reportProgress(item.id, {
    id: 'before-close',
    expectedRevision: view.revision,
    stage: '核验',
    summary: '已核验',
    nextAction: '结项',
    blocker: '待人工',
  });
  await f.items.criteria(
    item.id,
    item.criteria.map((c) => ({ ...c, met: true, evidence: '原始公告' })),
  );
  await f.items.complete(item.id);
  await assert.rejects(
    f.items.reportProgress(item.id, {
      id: 'completed',
      expectedRevision: 0,
      stage: '核验',
      summary: '迟到',
    }),
    /已结项/,
  );
  view = await f.items.reopen(item.id, '新证据');
  assert.equal(view.blocker, undefined);
  assert.equal(view.nextAction, undefined);
  const destination = join(f.root, 'work-items', item.id + '.json');
  const failing = createWorkItems(f.root, {
    ...f.files,
    read: async (id) => {
      const work = await f.files.read(id);
      await rename(destination, destination + '.backup');
      await mkdir(destination);
      return work;
    },
  });
  // The source read happens after reading the item, then atomic save genuinely fails.
  await assert.rejects(
    failing.reportProgress(item.id, {
      id: 'cannot-save',
      expectedRevision: view.revision,
      stage: '分析',
      summary: '不能假称保存',
    }),
    /EISDIR|ENOTDIR/,
  );
  assert.equal(
    JSON.parse(await readFile(destination + '.backup', 'utf8')).history.some(
      (h: { id: string }) => h.id === 'progress:cannot-save',
    ),
    false,
  );
});

for (const failOutput of [false, true])
  test(
    'actual run → Pi tool → file → HTTP remains a report after ' +
      (failOutput ? 'output failure' : 'success'),
    async (t) => {
      const f = await fixture(t),
        item = await f.create('PI');
      await seedCatalog(f.root, {
        baseUrl: 'http://test.invalid',
        model: 'test',
        apiKey: 'test-secret',
      });
      const seen: string[][] = [];
      const server = await createApplication({
        dataRoot: f.root,
        runSession: async (input) => {
          seen.push(input.tools.map((tool) => tool.name));
          const tool = input.tools.find(
            (tool) => tool.name === 'report_progress',
          )!;
          assert.ok(tool, 'formal ordinary execution offers report tool');
          await tool.execute(
            'call-1',
            {
              stage: '影响调查',
              summary: '已整理公告',
              nextAction: '补版本',
              blocker: '缺版本',
              materialIds: ['M01'],
            },
            input.signal,
            undefined,
            {} as never,
          );
          await tool.execute(
            'call-1',
            {
              stage: '影响调查',
              summary: '已整理公告',
              nextAction: '补版本',
              blocker: '缺版本',
              materialIds: ['M01'],
            },
            input.signal,
            undefined,
            {} as never,
          );
          return failOutput ? 'not JSON' : '{"answer":"原始公告"}';
        },
      });
      t.after(() => server.runs.close());
      const def = {
        ...definition,
        nodes: [
          {
            ...definition.nodes[0],
            expectedOutput: { type: 'object', required: ['answer'] },
          },
        ],
      };
      const id = await server.flow.saveDraft(f.work.id, undefined, def);
      const response = await server.app.request(
        '/api/items/' + item.id + '/actions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'run', definitionId: id }),
        },
      );
      assert.equal(response.status, 200, await response.clone().text());
      const launched = (await response.json()) as WorkItemView;
      await server.runs.wait(launched.execution!.runId);
      const result = await server.items.get(item.id);
      assert.equal(
        result.execution?.status,
        failOutput ? 'failed' : 'completed',
      );
      if (failOutput)
        assert.ok(
          result.execution?.error,
          'node output failure must be visible in item execution',
        );
      assert.equal(result.stage, '影响调查');
      assert.equal(result.status, 'open');
      assert.equal(result.criteria[0].met, false);
      const entries = result.history.filter((h) => h.kind === 'progress');
      assert.equal(entries.length, 1);
      assert.equal(entries[0].origin, 'agent');
      assert.equal(
        entries[0].source?.instanceId,
        (await server.files.read(f.work.id)).runs[0].results[0].instanceId,
      );
      const get = await (
        await server.app.request('/api/items/' + item.id)
      ).json();
      assert.equal(get.nextAction, '补版本');
      assert.equal(seen.length, 1);
    },
  );

test('expanded ordinary parallel agents report independently for two items sharing a method; planning and previews cannot report', async (t) => {
  const f = await fixture(t),
    first = await f.create('CASE-A'),
    second = await f.create('CASE-B');
  await seedCatalog(f.root, {
    baseUrl: 'http://test.invalid',
    model: 'test',
    apiKey: 'test-secret',
  });
  const child: Definition = {
    ...definition,
    nodes: [
      { ...definition.nodes[0], id: 'a', label: '调查 A' },
      { ...definition.nodes[0], id: 'b', label: '调查 B' },
    ],
    edges: [
      { from: ['$input', 'input'], to: ['a', 'input'] },
      { from: ['$input', 'input'], to: ['b', 'input'] },
    ],
    outputs: { output: ['a', 'output'], other: ['b', 'output'] },
  };
  // Expansion uses one output; merge both parallel branches explicitly.
  child.nodes.push({
    id: 'merge',
    label: '汇合',
    kind: 'function',
    mode: 'all',
    functionName: 'merge',
    inputNames: ['a', 'b'],
    contract: definition.nodes[0].contract,
  });
  child.edges.push(
    { from: ['a', 'output'], to: ['merge', 'a'] },
    { from: ['b', 'output'], to: ['merge', 'b'] },
  );
  child.outputs = { output: ['merge', 'output'] };
  const dynamic: Definition = {
    ...definition,
    nodes: [
      {
        ...definition.nodes[0],
        id: 'plan',
        kind: 'dynamic',
        dynamic: { boundary: '调查当前事项', maxNodes: 5 },
      },
    ],
    edges: [{ from: ['$input', 'input'], to: ['plan', 'input'] }],
    outputs: { output: ['plan', 'output'] },
  };
  let preview = false,
    planningCalls = 0,
    ordinaryCalls = 0;
  const server = await createApplication({
    dataRoot: f.root,
    runSession: async (input) => {
      const prompt = JSON.parse(input.prompt);
      const report = input.tools.find(
        (tool) => tool.name === 'report_progress',
      );
      if (prompt.dynamic) {
        planningCalls++;
        assert.equal(report, undefined);
        await input.tools
          .find((tool) => tool.name === 'submit_workflow')!
          .execute(
            'plan',
            { definition: child },
            input.signal,
            undefined,
            {} as never,
          );
      } else {
        ordinaryCalls++;
        assert.equal(!!report, !preview);
        if (report)
          await report.execute(
            'same-call-id',
            {
              stage: '影响调查',
              summary: prompt.workItem.key + ' ' + prompt.task,
              materialIds: ['M01'],
            },
            input.signal,
            undefined,
            {} as never,
          );
      }
      return '{}';
    },
  });
  t.after(() => server.runs.close());
  const id = await server.flow.saveDraft(f.work.id, undefined, dynamic);
  const launch = async (item: WorkItemView) => {
    const response = await server.app.request(
      '/api/items/' + item.id + '/actions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', definitionId: id }),
      },
    );
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<WorkItemView>;
  };
  const launched = await Promise.all([launch(first), launch(second)]);
  await Promise.all(
    launched.map((item) => server.runs.wait(item.execution!.runId)),
  );
  for (const item of [first, second]) {
    const view = await server.items.get(item.id);
    assert.equal(
      view.execution?.status,
      'completed',
      view.execution?.error ?? '',
    );
    const history = view.history.filter((h) => h.kind === 'progress');
    assert.equal(history.length, 2);
    assert.deepEqual(
      new Set(history.map((h) => h.source?.nodeId)),
      new Set(['plan/a', 'plan/b']),
    );
    assert.ok(history.every((h) => h.summary.startsWith(item.key)));
  }
  assert.equal(planningCalls, 2);
  assert.equal(ordinaryCalls, 4);
  preview = true;
  const inputs = {
    input: [
      {
        sampleId: 'M01',
        value: '原始公告',
        materialIds: ['M01'],
        sourceResultIds: [],
      },
    ],
  };
  for (const options of [
    { scope: 'full' as const, effectMode: 'preview' as const },
    { scope: { nodeId: 'investigate' }, effectMode: 'commit' as const },
    {
      scope: 'full' as const,
      effectMode: 'commit' as const,
      comparisonId: 'comparison',
    },
  ]) {
    const runId = await server.runs.start(f.work.id, {
      definitionId: f.definitionId,
      workItem: first,
      inputs,
      ...options,
    });
    await server.runs.wait(runId);
    assert.equal(
      (await server.files.read(f.work.id)).runs.find((r) => r.id === runId)
        ?.effectMode,
      'preview',
    );
  }
  assert.equal(
    (await server.items.get(first.id)).history.filter(
      (h) => h.kind === 'progress',
    ).length,
    2,
  );
});

test('stop while a definition is being read prevents a late HTTP-source report from saving', async (t) => {
  const f = await fixture(t),
    item = await f.create('STOP-RACE');
  await f.launch(item);
  const guarded = createWorkItems(f.root, {
    ...f.files,
    readDefinition: async (workId, definitionId) => {
      const fixed = await f.files.readDefinition(workId, definitionId);
      await f.files.change(workId, (w) => {
        w.runs[0].stopRequested = true;
        w.runs[0].status = 'stopping';
      });
      return fixed;
    },
  });
  await assert.rejects(
    guarded.reportProgress(item.id, {
      id: 'late',
      stage: '调查',
      summary: '迟到',
      source: {
        workId: f.work.id,
        runId: 'run-1',
        definitionId: f.definitionId,
        nodeId: 'investigate',
        instanceId: 'instance',
      },
    }),
    /停止|结束/,
  );
  assert.equal(
    (await f.items.get(item.id)).history.some((h) => h.kind === 'progress'),
    false,
  );
});
