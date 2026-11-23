import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type {
  Definition,
  Json,
  NodeExecution,
  Work,
} from '../src/shared/records.ts';
import type { SessionInput } from '../src/server/assistant/pi.ts';
import { createFiles } from '../src/server/files/index.ts';
import { createApplication } from '../src/server/index.ts';
import { seedCatalog } from './catalog-fixture.ts';

function cveSourceCheckDefinition(): Definition {
  return {
    schemaVersion: 1,
    inputs: ['targets'],
    nodes: [
      {
        id: 'verify',
        label: '核查仓库受影响情况',
        kind: 'agent',
        operation: 'map',
        task: '按目标核查 CVE 源码受影响情况',
      },
      {
        id: 'report',
        label: '汇总核查记录',
        kind: 'function',
        functionName: 'identity',
        operation: 'aggregate',
      },
    ],
    edges: [
      { from: ['$input', 'targets'], to: ['verify', 'input'] },
      { from: ['verify', 'output'], to: ['report', 'input'] },
    ],
    outputs: { rows: ['report', 'output'] },
  };
}

test('Run externalization stores each Run in runs/<runId>.json and keeps work.json lightweight and backwards-compatible', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'route-b-runs-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const files = createFiles(root);
  const work: Work = {
    id: 'w-ext',
    goal: 'CVE 批次存储解耦',
    createdAt: '2026-11-23T00:00:00.000Z',
    updatedAt: '2026-11-23T00:00:00.000Z',
    revision: 0,
    materials: [],
    definitionIds: [],
    view: { positions: {} },
    runs: [],
    comparisons: [],
    keptResultIds: [],
    messages: [],
  };
  await files.create(work);
  await files.change(work.id, (w) => {
    w.runs.push({
      id: 'run-1',
      definitionId: 'def-1',
      scope: 'full',
      inputs: {},
      materials: [],
      status: 'running',
      stopRequested: false,
      nodeStates: { verify: 'running' },
      results: [],
      startedAt: '2026-11-23T00:00:01.000Z',
    });
  });
  await files.changeRun(work.id, 'run-1', (r) => {
    r.status = 'completed';
    r.nodeStates.verify = 'completed';
    r.finishedAt = '2026-11-23T00:00:02.000Z';
  });

  // work.json must store runIds only (empty inline runs), while runs/run-1.json holds the full Run.
  const rawShell = JSON.parse(
    await readFile(join(root, work.id, 'work.json'), 'utf8'),
  );
  assert.deepEqual(rawShell.runs, []);
  assert.deepEqual(rawShell.runIds, ['run-1']);
  const rawRun = JSON.parse(
    await readFile(join(root, work.id, 'runs', 'run-1.json'), 'utf8'),
  );
  assert.equal(rawRun.status, 'completed');

  // Reopening from a fresh FileStore transparently reassembles Work.runs without leaking runIds.
  const reopened = await createFiles(root).read(work.id);
  assert.equal('runIds' in reopened, false);
  assert.equal(reopened.runs.length, 1);
  assert.equal(reopened.runs[0].status, 'completed');

  // Legacy work.json with inline runs (no runIds) still loads transparently and migrates on write.
  const legacyDir = join(root, 'w-legacy');
  await files.create({ ...work, id: 'w-legacy' });
  await writeFile(
    join(legacyDir, 'work.json'),
    JSON.stringify({
      ...work,
      id: 'w-legacy',
      runs: [rawRun],
    }),
  );
  const loadedLegacy = await createFiles(root).read('w-legacy');
  assert.equal(loadedLegacy.runs.length, 1);
  assert.equal(loadedLegacy.runs[0].id, 'run-1');
  await files.change('w-legacy', (w) => {
    w.title = '已迁移';
  });
  const migratedShell = JSON.parse(
    await readFile(join(legacyDir, 'work.json'), 'utf8'),
  );
  assert.deepEqual(migratedShell.runs, []);
  assert.deepEqual(migratedShell.runIds, ['run-1']);
  assert.equal(existsSync(join(legacyDir, 'runs', 'run-1.json')), true);
});

test('non-destructive retry preserves main draft/bindings/receivedInputs and multi-run delivery composes old + retried + updated rows with exact sources', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'route-b-cve-'));
  const attempts = new Map<string, number>();
  const app = await createApplication({
    dataRoot: root,
    executeNode: async (ctx: NodeExecution): Promise<Json> => {
      const target = String(ctx.inputs.input[0].value);
      const count = (attempts.get(target) ?? 0) + 1;
      attempts.set(target, count);
      if (target === 'worker' && count === 1)
        throw new Error('Sourcegraph 临时超时');
      return {
        repo: target,
        conclusion:
          target === 'worker'
            ? count === 2
              ? 'unknown'
              : 'not_impacted'
            : target === 'api'
              ? 'impacted'
              : 'not_impacted',
        round: count,
      };
    },
  });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });

  const post = async (path: string, body: unknown) => {
    const res = await app.app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    assert.ok(res.ok, `${path} -> ${res.status}: ${text}`);
    return JSON.parse(text);
  };

  const created = await post('/api/items', {
    key: 'CVE-2026-9001',
    title: 'CVE-2026-9001 仓库影响核查',
    goal: '核查 api / worker / portal 三个仓库受影响情况',
    materials: ['api', 'worker', 'portal'],
  });
  const act = async (
    action: string,
    extra: Record<string, unknown> = {},
    surface: 'workspace' | 'item' = 'workspace',
  ) => {
    const current = await app.items.get(created.id);
    return post(
      surface === 'workspace'
        ? `/api/items/${created.id}/workspace/actions`
        : `/api/items/${created.id}/actions`,
      { action, baseRevision: current.revision, ...extra },
    );
  };

  // 1. Save main flow, bind 3 materials, and save OpenUI records view.
  let ws = await act('saveFlow', { definition: cveSourceCheckDefinition() });
  const originalDraftId = ws.work.work.draftId as string;
  const materialIds = ws.item.materials.map((m: any) => m.id);
  ws = await act('selectInputs', { inputPort: 'targets', materialIds });
  const originalBindings = structuredClone(ws.item.inputBindings);
  const originalReceivedCount = ws.item.receivedInputs?.length ?? 0;

  const uiSource = [
    'root = Workspace("CVE-2026-9001 影响矩阵", [matrix])',
    'matrix = Section("仓库影响", [records])',
    'records = Records("rows", "核查记录", "repo", [Field("repo", "仓库"), Field("conclusion", "结论"), Field("round", "轮次")])',
  ].join('\n');
  ws = await act('saveUiProgram', {
    definitionId: originalDraftId,
    source: uiSource,
  });
  const programId = ws.uiProgram.id as string;

  // 2. First formal run: api + portal succeed, worker fails.
  ws = await act('run');
  const firstRef = ws.item.runs.at(-1);
  await app.runs.wait(firstRef.runId);
  const firstRun = (await app.files.read(firstRef.workId)).runs.find(
    (r) => r.id === firstRef.runId,
  )!;
  assert.equal(firstRun.status, 'failed');
  const firstSucceeded = firstRun.results.filter(
    (r) => r.nodeId === 'verify' && r.status === 'completed',
  );
  const firstFailed = firstRun.results.filter(
    (r) => r.nodeId === 'verify' && r.status === 'failed',
  );
  assert.equal(firstSucceeded.length, 2);
  assert.equal(firstFailed.length, 1);

  // 3. Non-destructive retry of ONLY the failed worker instance.
  ws = await act('continueFailedInputs', {
    workId: firstRef.workId,
    runId: firstRef.runId,
    resultIds: firstFailed.map((r) => r.id),
  });
  const retryRef = ws.item.runs.at(-1);
  await app.runs.wait(retryRef.runId);

  // Critical Route B invariant: main draftId, inputBindings, and receivedInputs MUST remain untouched!
  const afterRetry = await app.composition.snapshot(created.id);
  assert.equal(afterRetry.work!.work.draftId, originalDraftId);
  assert.deepEqual(afterRetry.item.inputBindings, originalBindings);
  assert.equal(
    afterRetry.item.receivedInputs?.length ?? 0,
    originalReceivedCount,
  );
  assert.deepEqual(Object.fromEntries(attempts), {
    api: 1,
    worker: 2,
    portal: 1,
  });

  // 4. Multi-run composed delivery directly combines old succeeded instances + retry run without any dummy merge flow!
  ws = await act('publishDelivery', {
    output: 'rows',
    programId,
    sources: [
      {
        workId: firstRef.workId,
        runId: firstRef.runId,
        definitionId: firstRef.definitionId,
        nodeId: 'verify',
        port: 'output',
        resultIds: firstSucceeded.map((r) => r.id),
      },
      {
        workId: retryRef.workId,
        runId: retryRef.runId,
        definitionId: retryRef.definitionId,
        output: 'output',
      },
    ],
  });
  assert.equal(ws.deliveries.length, 1);
  const delivery = ws.deliveries[0];
  assert.equal(delivery.rows.length, 3);
  const byRepo = Object.fromEntries(delivery.rows.map((r: any) => [r.repo, r]));
  assert.equal(byRepo.api.conclusion, 'impacted');
  assert.equal(byRepo.portal.conclusion, 'not_impacted');
  assert.equal(byRepo.worker.conclusion, 'unknown');
  // Every row keeps its exact producing runId in sources!
  const sourceRunIds = new Set(delivery.sources.map((s: any) => s.runId));
  assert.equal(sourceRunIds.has(firstRef.runId), true);
  assert.equal(sourceRunIds.has(retryRef.runId), true);

  // 5. Follow-up targeted re-check for worker (simulating new evidence) overlays ONLY worker by rowKey!
  ws = await act('continueFailedInputs', {
    workId: firstRef.workId,
    runId: firstRef.runId,
    resultIds: firstFailed.map((r) => r.id),
  });
  const recheckRef = ws.item.runs.at(-1);
  await app.runs.wait(recheckRef.runId);
  ws = await act('publishDelivery', {
    output: 'rows',
    programId,
    sources: [
      {
        workId: firstRef.workId,
        runId: firstRef.runId,
        definitionId: firstRef.definitionId,
        nodeId: 'verify',
        port: 'output',
        resultIds: firstSucceeded.map((r) => r.id),
      },
      {
        workId: retryRef.workId,
        runId: retryRef.runId,
        definitionId: retryRef.definitionId,
        output: 'output',
      },
      {
        workId: recheckRef.workId,
        runId: recheckRef.runId,
        definitionId: recheckRef.definitionId,
        output: 'output',
      },
    ],
  });
  const updated = Object.fromEntries(
    ws.deliveries[0].rows.map((r: any) => [r.repo, r]),
  );
  assert.equal(ws.deliveries[0].rows.length, 3);
  assert.equal(updated.api.round, 1);
  assert.equal(updated.portal.round, 1);
  assert.equal(updated.worker.round, 3);
  assert.equal(updated.worker.conclusion, 'not_impacted');

  // 6. Integrity check: failed run without explicit resultIds must be rejected.
  const latestItem = await app.items.get(created.id);
  const badRes = await app.app.request(
    `/api/items/${created.id}/workspace/actions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'publishDelivery',
        baseRevision: latestItem.revision,
        output: 'rows',
        programId,
        sources: [
          {
            workId: firstRef.workId,
            runId: firstRef.runId,
            definitionId: firstRef.definitionId,
            nodeId: 'verify',
            port: 'output',
          },
        ],
      }),
    },
  );
  assert.equal(badRes.status, 400);

  // 7. Unified /api/items/:id/actions surface still serves lifecycle actions seamlessly.
  const viaItemSurface = await act(
    'addEvidence',
    { materials: ['补充官方公告确认补丁已合入'] },
    'item',
  );
  assert.equal(viaItemSurface.materials.length, 4);
});

test('WorkItem Assistant exposes 9 consolidated tools and apply_workspace_plan atomically chains flow + inputs + UI', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'route-b-assistant-'));
  await seedCatalog(root, {
    baseUrl: 'https://fixture.invalid',
    model: 'fixture',
    apiKey: 'fixture-key',
  });
  let observedToolNames: string[] = [];
  let appliedReceipt: any;
  const app = await createApplication({
    dataRoot: root,
    executeNode: async (ctx) => ({
      repo: String(ctx.inputs.input[0].value),
      conclusion: 'not_impacted',
    }),
    runSession: async (input: SessionInput) => {
      observedToolNames = input.tools.map((tool) => tool.name);
      const call = async (name: string, args: unknown) => {
        const found = input.tools.find((t) => t.name === name);
        assert.ok(found, `missing tool ${name}`);
        const res = (await found.execute(
          'route-b-tool',
          args as never,
          input.signal,
          undefined as never,
          undefined as never,
        )) as any;
        return JSON.parse(res.content[0].text);
      };
      const ws = await call('inspect_workspace', { target: 'summary' });
      const uiSource = [
        'root = Workspace("核查看板", [sec])',
        'sec = Section("核查结果", [records])',
        'records = Records("rows", "结果列表", "repo", [Field("repo", "仓库"), Field("conclusion", "结论")])',
      ].join('\n');
      // One atomic call chains saveFlow -> selectMaterials -> saveUiProgram with automatic version chaining!
      appliedReceipt = await call('apply_workspace_plan', {
        baseRevision: ws.item.revision,
        definition: cveSourceCheckDefinition(),
        selectMaterials: [
          {
            inputPort: 'targets',
            materialIds: ws.item.materials.map((m: any) => m.id),
          },
        ],
        uiSource,
      });
      const check = await call('check_workspace', {});
      assert.equal(check.canExecute, true, JSON.stringify(check));
      const started = await call('run_control', {
        action: 'start',
        baseRevision: appliedReceipt.item.revision,
      });
      const runId = started.work.runs.at(-1).id;
      await app.runs.wait(runId);
      const inspectedRun = await call('inspect_workspace', {
        target: 'run',
        runId,
      });
      assert.equal(inspectedRun.status, 'completed');
      const latest = await call('inspect_workspace', { target: 'summary' });
      await call('publish_delivery', {
        baseRevision: latest.item.revision,
        runId,
        output: 'rows',
        programId: latest.uiProgram.id,
      });
      return '已完成一次原子方案提交、执行与交付发布。';
    },
  });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });

  const item = await app.items.create({
    key: 'CVE-2026-9002',
    title: 'CVE-2026-9002 原子方案测试',
    goal: '核查两个仓库',
    materials: ['repo-alpha', 'repo-beta'],
  });
  const res = await app.app.request(`/api/items/${item.id}/workspace/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'assistant',
      text: '配置流程、绑定输入、建界面并执行发布',
    }),
  });
  assert.equal(res.status, 200);
  const receipt = (await res.json()) as any;
  for (let i = 0; i < 150; i++) {
    const work = await app.files.read(item.workId);
    const msg = work.messages.find(
      (m) => m.role === 'assistant' && m.requestId === receipt.requestId,
    );
    if (msg?.status === 'completed' || msg?.status === 'failed') {
      assert.equal(msg.status, 'completed', msg.error ?? '');
      break;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.deepEqual(observedToolNames, [
    'describe_capabilities',
    'inspect_workspace',
    'methods',
    'check_workspace',
    'apply_workspace_plan',
    'manage_inputs',
    'run_control',
    'publish_delivery',
    'set_completion_requirements',
  ]);
  assert.deepEqual(appliedReceipt.applied, ['flow', 'materials', 'uiSource']);
  const finalWs = await app.composition.snapshot(item.id);
  assert.equal(finalWs.deliveries.length, 1);
  assert.equal(finalWs.deliveries[0].rows?.length, 2);
});

test('per-item locks allow distinct work items to update concurrently while preserving tree consistency', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'route-b-locks-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const app = await createApplication({ dataRoot: root });
  t.after(() => {
    app.batches.close();
    app.runs.close();
  });
  const parent = await app.items.create({
    key: 'BATCH-2026',
    title: 'CVE 批次父项',
    goal: '并发跟踪 12 个 CVE',
    materials: [],
  });
  const children = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      app.items.create({
        key: `CVE-2026-10${String(i).padStart(2, '0')}`,
        title: `CVE-${i}`,
        goal: `核查 CVE-${i}`,
        parentId: parent.id,
        materials: [`repo-${i}`],
      }),
    ),
  );
  // Concurrent evidence additions across 12 distinct items all succeed without race or stale cache.
  await Promise.all(
    children.map((child, i) =>
      app.items.addEvidence(child.id, [`证据-${i}`], child.revision),
    ),
  );
  const page = await app.items.summaries({ parentId: parent.id, pageSize: 50 });
  assert.equal(page.total, 12);
  for (const child of children) {
    const fresh = await app.items.get(child.id);
    assert.equal(fresh.materials.length, 2);
  }
});

test('CVE v2 pipelines & local batch sample regression (local-only when sample dir exists)', async (t) => {
  const sampleBase = resolve('.cve-regression-samples');
  const sampleDir =
    process.env.CVE_REGRESSION_SAMPLE_DIR ||
    (existsSync(sampleBase)
      ? readdirSync(sampleBase, { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isDirectory() &&
              existsSync(join(sampleBase, entry.name, 'progress.json')),
          )
          .map((entry) => join(sampleBase, entry.name))
          .sort()[0]
      : undefined);
  if (!sampleDir || !existsSync(join(sampleDir, 'progress.json'))) {
    t.skip('local .cve-regression-samples batch not present');
    return;
  }
  const progress = JSON.parse(
    await readFile(join(sampleDir, 'progress.json'), 'utf8'),
  ) as { entries: { cve?: string; title?: string; key?: string }[] };
  const researchDef = JSON.parse(
    await readFile(resolve('pipelines/cve/v2/research.json'), 'utf8'),
  ).definition as Definition;
  const sourceCheckDef = JSON.parse(
    await readFile(resolve('pipelines/cve/v2/source-check.json'), 'utf8'),
  ).definition as Definition;

  const root = await mkdtemp(join(tmpdir(), 'route-b-real-cve-'));
  const app = await createApplication({
    dataRoot: root,
    executeNode: async (ctx): Promise<Json> => {
      if (ctx.node.id === 'verify') {
        const pair = ctx.inputs.input[0].value as { target?: string };
        return {
          target: pair.target ?? 'unknown',
          conclusion: 'not_impacted',
          evidence: 'fixture-verified',
        };
      }
      return {
        cve: 'sample',
        summary: 'ok',
        affected_versions: [],
        mechanisms: [],
        unknowns: [],
      };
    },
  });
  t.after(async () => {
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });

  // Install both CVE v2 public methods and verify zero schema/check issues.
  const researchWork = await app.work.createWork('漏洞事实研究 v2', []);
  const researchVer = await app.flow.saveDraft(
    researchWork.id,
    undefined,
    researchDef,
  );
  await app.flow.adopt(researchWork.id, researchVer);

  const checkWork = await app.work.createWork('仓库漏洞核查 v2', []);
  const checkVer = await app.flow.saveDraft(
    checkWork.id,
    undefined,
    sourceCheckDef,
  );
  await app.flow.adopt(checkWork.id, checkVer);

  // Import all batch entries from local progress.json under one batch parent.
  assert.ok(progress.entries.length > 0);
  const parent = await app.items.create({
    key: 'CVE-BATCH-REG',
    title: `CVE 回归批次 (${progress.entries.length}项)`,
    goal: '基于本地 CVE 批次样本验证多工作项并发、外部化 Run 存储与方法调用',
    materials: [],
  });
  const createdChildren = [];
  for (const [idx, entry] of progress.entries.entries()) {
    const label = entry.cve ?? entry.key ?? entry.title ?? `CVE-${idx + 1}`;
    createdChildren.push(
      await app.items.create({
        key: `REG-${idx + 1}-${label.slice(0, 24)}`,
        title: label,
        goal: `核查 ${label}`,
        parentId: parent.id,
        materials: [label],
      }),
    );
  }
  const summary = await app.items.summaries({
    parentId: parent.id,
    pageSize: Math.max(50, progress.entries.length),
  });
  assert.equal(summary.total, progress.entries.length);

  // Verify the method catalog discovers both CVE v2 adopted pipelines cleanly.
  const catalog = await app.composition.methods('漏洞');
  assert.ok(catalog.some((m) => m.workId === researchWork.id && m.adopted));
  assert.ok(catalog.some((m) => m.workId === checkWork.id && m.adopted));
});

test('WorkItem status aligns stage default, partial-retry unretried failures, active child propagation, and todo buckets', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'status-alignment-'));
  let failTargets = new Set<string>(['repo-b', 'repo-c']);
  let releaseChild!: () => void;
  const childBlocked = new Promise<void>((resolve) => {
    releaseChild = resolve;
  });
  let childEntered!: () => void;
  const childRunning = new Promise<void>((resolve) => {
    childEntered = resolve;
  });
  const app = await createApplication({
    dataRoot: root,
    executeNode: async (ctx) => {
      const target = String(ctx.inputs.input[0].value);
      if (target === 'slow-child') {
        childEntered();
        await childBlocked;
        return { repo: target, conclusion: 'not_impacted' };
      }
      if (failTargets.has(target)) throw Error(`mock fail ${target}`);
      return { repo: target, conclusion: 'not_impacted' };
    },
  });
  t.after(async () => {
    releaseChild();
    app.batches.close();
    app.runs.close();
    await rm(root, { recursive: true, force: true });
  });

  // 1. Newly created item starts with empty stage (no fake '待处理').
  const parent = await app.items.create({
    title: '批次父项',
    goal: '核查多个仓库',
    materials: ['repo-a', 'repo-b', 'repo-c'],
  });
  assert.equal(parent.stage, '');
  assert.equal(parent.effectiveStatus, 'open');

  // 2. Partial retry leaving unretried failures stays 'attention' & todo='blocked'; retrying remaining moves to 'review'.
  let ws = await app.composition.snapshot(parent.id);
  ws = await app.composition.saveFlow(
    parent.id,
    ws.item.revision,
    cveSourceCheckDefinition(),
    ws.work!.work.draftId,
  );
  ws = await app.composition.selectInputs(
    parent.id,
    ws.item.revision,
    'targets',
    ws.item.materials.map((m) => m.id),
  );
  const started = await app.execution.runItem(parent.id, {
    baseRevision: ws.item.revision,
  });
  const firstRunId = started.runs.at(-1)!.runId;
  await app.runs.wait(firstRunId);
  const afterFail = await app.items.get(parent.id);
  assert.equal(afterFail.effectiveStatus, 'attention');
  const failPage = await app.items.summaries({ ids: [parent.id] });
  assert.equal(failPage.items[0].effectiveStatus, 'attention');
  assert.equal(failPage.items[0].todo, 'blocked');

  const workAfterFail = await app.files.read(parent.workId);
  const failedResults = workAfterFail.runs
    .find((r) => r.id === firstRunId)!
    .results.filter((r) => r.status === 'failed');
  assert.equal(failedResults.length, 2);

  // Retry only the first failed result — second is still unretried -> must stay 'attention'.
  failTargets = new Set<string>();
  const partialRetry = await app.execution.continueFailedInputs(parent.id, {
    baseRevision: afterFail.revision,
    workId: parent.workId,
    runId: firstRunId,
    resultIds: [failedResults[0].id],
  });
  await app.runs.wait(partialRetry.runs.at(-1)!.runId);
  const afterPartial = await app.items.get(parent.id);
  assert.equal(afterPartial.effectiveStatus, 'attention');
  const partialPage = await app.items.summaries({ ids: [parent.id] });
  assert.equal(partialPage.items[0].effectiveStatus, 'attention');
  assert.equal(partialPage.items[0].todo, 'blocked');

  // Retry the remaining failed result -> all source failures covered -> 'review'.
  const finalRetry = await app.execution.continueFailedInputs(parent.id, {
    baseRevision: afterPartial.revision,
    workId: parent.workId,
    runId: firstRunId,
    resultIds: [failedResults[1].id],
  });
  await app.runs.wait(finalRetry.runs.at(-1)!.runId);
  const afterFullRetry = await app.items.get(parent.id);
  assert.equal(afterFullRetry.effectiveStatus, 'review');
  const reviewPage = await app.items.summaries({ ids: [parent.id] });
  assert.equal(reviewPage.items[0].effectiveStatus, 'review');
  assert.equal(reviewPage.items[0].todo, 'review');

  // 3. Active included child propagates 'running' to open parent; excluded child does not.
  const batchParent = await app.items.create({
    title: '父子批跑验证',
    goal: '通过子项分治执行',
    materials: [],
  });
  const child = await app.items.create({
    title: '运行中子项',
    goal: '核查慢仓',
    parentId: batchParent.id,
    materials: ['slow-child'],
  });
  let cws = await app.composition.snapshot(child.id);
  cws = await app.composition.saveFlow(
    child.id,
    cws.item.revision,
    cveSourceCheckDefinition(),
    cws.work!.work.draftId,
  );
  cws = await app.composition.selectInputs(
    child.id,
    cws.item.revision,
    'targets',
    cws.item.materials.map((m) => m.id),
  );
  const childStarted = await app.execution.runItem(child.id, {
    baseRevision: cws.item.revision,
  });
  await childRunning;
  assert.equal(
    (await app.items.get(batchParent.id)).effectiveStatus,
    'running',
  );
  const runningSummary = await app.items.summaries({ ids: [batchParent.id] });
  assert.equal(runningSummary.items[0].effectiveStatus, 'running');
  assert.equal(runningSummary.items[0].todo, 'running');

  releaseChild();
  await app.runs.wait(childStarted.runs.at(-1)!.runId);
  assert.equal((await app.items.get(batchParent.id)).effectiveStatus, 'open');
  assert.equal((await app.items.get(child.id)).effectiveStatus, 'review');

  // 4. Interrupted run maps consistently to effectiveStatus='attention' and todo='blocked'.
  await app.files.change(child.workId, (w) => {
    w.runs.at(-1)!.status = 'interrupted';
  });
  const interruptedPage = await app.items.summaries({ ids: [child.id] });
  assert.equal(interruptedPage.items[0].effectiveStatus, 'attention');
  assert.equal(interruptedPage.items[0].todo, 'blocked');
});
