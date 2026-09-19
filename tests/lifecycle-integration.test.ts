import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../src/server/index.ts';
import type {
  Definition,
  Json,
  FlowNode,
  NodeExecution,
  Run,
  Snapshot,
  WorkItemView,
  WorkItemPage,
} from '../src/shared/records.ts';

type Application = Awaited<ReturnType<typeof createApplication>>;
const identity: FlowNode = {
  id: 'investigate',
  label: '调查证据',
  kind: 'agent',
  mode: 'each',
  operation: 'map',
  task: '形成有依据的调查结论',
  inputSchema: { type: 'string' },
  expectedOutput: {
    type: 'object',
    required: ['evidence'],
    properties: { evidence: { type: 'string' } },
    additionalProperties: false,
  },
};
function lifecycle(timeoutSeconds?: number): Definition {
  const nodes: FlowNode[] = [
    identity,
    {
      id: 'investigated',
      label: '记录调查进展',
      kind: 'milestone',
      mode: 'all',
      milestone: {
        stage: '已完成调查',
        summary: '已确认影响范围，等待修复公告',
      },
    },
    {
      id: 'announcement',
      label: '等待厂商公告',
      kind: 'wait',
      mode: 'all',
      wait: {
        event: 'vendor.announcement',
        reason: '等待厂商发布修复公告',
        ...(timeoutSeconds === undefined ? {} : { timeoutSeconds }),
      },
    },
    {
      id: 'reviewed',
      label: '记录复核进展',
      kind: 'milestone',
      mode: 'all',
      milestone: {
        stage: '完成复核',
        summary: '公告已到达或复核期限已到，请确认处置条件',
      },
    },
  ];
  return {
    schemaVersion: 1,
    inputs: ['materials'],
    nodes,
    edges: nodes.map((node, i) => ({
      from: i === 0 ? ['$input', 'materials'] : [nodes[i - 1].id, 'output'],
      to: [node.id, 'input'],
    })),
    outputs: { result: ['reviewed', 'output'] },
  };
}
function immediate(): Definition {
  const flow = lifecycle();
  flow.nodes = flow.nodes.slice(0, 2);
  flow.edges = flow.edges.slice(0, 2);
  flow.outputs = { result: ['investigated', 'output'] };
  return flow;
}
async function request<T>(
  server: Application,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await server.app.request(
    path,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = await res.json();
  assert.equal(res.ok, true, `${res.status} ${path}: ${JSON.stringify(data)}`);
  return data as T;
}
async function rejected(server: Application, path: string, body: unknown) {
  const res = await server.app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(res.ok, false, `Unexpectedly accepted ${JSON.stringify(body)}`);
  const data = (await res.json()) as { error: string };
  assert.equal(typeof data.error, 'string');
  assert.ok(data.error.length > 0);
}
async function eventually<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
): Promise<T> {
  const deadline = Date.now() + 5000;
  let value: T;
  do {
    value = await read();
    if (predicate(value)) return value;
    await delay(15);
  } while (Date.now() < deadline);
  assert.fail(`State did not converge: ${JSON.stringify(value)}`);
}
const itemPath = (id: string) => `/api/items/${id}`;
const actionPath = (id: string) => `${itemPath(id)}/actions`;
const readItem = (server: Application, id: string) =>
  request<WorkItemView>(server, itemPath(id));
const act = (server: Application, id: string, body: unknown) =>
  request<WorkItemView>(server, actionPath(id), body);
async function method(server: Application, definition: Definition) {
  const created = await request<Snapshot>(server, '/api/works', {
    goal: '可复用的调查方法',
    materials: ['方法示例，不允许进入工作项输入'],
  });
  return request<Snapshot>(server, `/api/works/${created.work.id}/actions`, {
    action: 'saveDraft',
    definition,
  });
}
async function item(server: Application, workflowId: string, key: string) {
  return request<WorkItemView>(server, '/api/items', {
    workflowId,
    key,
    title: `${key} / 产品 A`,
    goal: `确认 ${key} 是否受影响并完成处置`,
    materials: [`${key} 初始证据`],
    criteria: ['影响判断有证据', '处置建议已验证'],
  });
}
async function runRecord(
  server: Application,
  view: WorkItemView,
): Promise<Run> {
  const ref = view.runs.at(-1)!;
  const snapshot = await request<Snapshot>(server, `/api/works/${ref.workId}`);
  return snapshot.work.runs.find((run) => run.id === ref.runId)!;
}
// Only Agent generation is a deterministic test double. HTTP, files, schema checks,
// execution scheduling, business updates, and recovery use the actual modules.
const evidenceExecutor = async (context: NodeExecution) => ({
  evidence: String(Object.values(context.inputs).flat()[0].value),
});
async function fixture(
  executeNode: (context: NodeExecution) => Promise<Json> = evidenceExecutor,
) {
  const root = await mkdtemp(join(tmpdir(), 'flow-lifecycle-'));
  const servers: Application[] = [];
  const open = async () => {
    const server = await createApplication({ dataRoot: root, executeNode });
    servers.push(server);
    return server;
  };
  const server = await open();
  return {
    server,
    open,
    cleanup: async () => {
      for (const s of servers) await s.runs.close?.();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('L1/L5 同一方法的工作项输入隔离，里程碑不自动结项，外部查询与完成依据一致', async () => {
  const seen: string[] = [];
  const f = await fixture(async (c) => {
    seen.push(String(Object.values(c.inputs).flat()[0].value));
    return evidenceExecutor(c);
  });
  try {
    const m = await method(f.server, immediate());
    const a = await item(f.server, m.work.id, 'CVE-A'),
      b = await item(f.server, m.work.id, 'CVE-B');
    await Promise.all([
      act(f.server, a.id, { action: 'run' }),
      act(f.server, b.id, { action: 'run' }),
    ]);
    const done = await eventually(
      () => readItem(f.server, a.id),
      (v) => v.execution?.status === 'completed',
    );
    await eventually(
      () => readItem(f.server, b.id),
      (v) => v.execution?.status === 'completed',
    );
    assert.deepEqual(seen.sort(), ['CVE-A 初始证据', 'CVE-B 初始证据']);
    assert.equal(done.status, 'open');
    assert.equal(done.stage, '已完成调查');
    const milestone = done.history.find((h) => h.kind === 'milestone')!;
    assert.equal(milestone.source?.runId, done.runs[0].runId);
    assert.ok(milestone.materialIds?.includes(done.materials[0].id));
    const beforeRead = structuredClone(done);
    const found = await request<WorkItemPage>(
      f.server,
      '/api/items?query=CVE-A&status=open',
    );
    assert.deepEqual(
      found.items.map((v) => v.id),
      [a.id],
    );
    assert.deepEqual(
      await readItem(f.server, a.id),
      beforeRead,
      'GET must not change progress or start execution',
    );
    await rejected(f.server, actionPath(a.id), { action: 'complete' });
    await rejected(f.server, actionPath(a.id), {
      action: 'criteria',
      criteria: done.criteria.map((c) => ({ ...c, met: true, evidence: '' })),
    });
    await rejected(f.server, actionPath(a.id), { action: 'complete' });
    await act(f.server, a.id, {
      action: 'criteria',
      criteria: done.criteria.map((c) => ({
        ...c,
        met: true,
        evidence: `依据：${done.materials[0].id} 调查及复核记录`,
      })),
    });
    const completed = await act(f.server, a.id, { action: 'complete' });
    assert.equal(completed.status, 'completed');
    const reopened = await act(f.server, a.id, {
      action: 'reopen',
      reason: '新公告推翻此前判断',
    });
    assert.equal(reopened.status, 'open');
    assert.equal(reopened.id, a.id);
    assert.ok(reopened.history.some((h) => h.kind === 'completed'));
    assert.ok(
      reopened.history.some(
        (h) => h.kind === 'reopened' && h.summary.includes('新公告'),
      ),
    );
    assert.equal((await readItem(f.server, b.id)).status, 'open');
  } finally {
    await f.cleanup();
  }
});

test('L2 真实文件重启恢复等待，错误事件不唤醒，同一事件不重复里程碑，已完成 Agent 不重跑', async () => {
  let calls = 0;
  const f = await fixture(async (c) => {
    calls++;
    return evidenceExecutor(c);
  });
  try {
    const m = await method(f.server, lifecycle()),
      a = await item(f.server, m.work.id, 'CVE-WAIT');
    await act(f.server, a.id, { action: 'run' });
    const waiting = await eventually(
      () => readItem(f.server, a.id),
      (v) => v.effectiveStatus === 'waiting',
    );
    const originalRun = await runRecord(f.server, waiting);
    assert.equal(waiting.execution?.waits[0].reason, '等待厂商发布修复公告');
    await rejected(f.server, actionPath(a.id), { action: 'run' });
    await rejected(f.server, actionPath(a.id), {
      action: 'method',
      workflowId: m.work.id,
    });
    await rejected(f.server, actionPath(a.id), {
      action: 'signal',
      id: 'wrong',
      name: 'unrelated.event',
    });
    assert.equal((await readItem(f.server, a.id)).effectiveStatus, 'waiting');
    await act(f.server, a.id, {
      action: 'addEvidence',
      materials: ['追加的修复公告'],
    });
    await f.server.runs.close();
    const restarted = await f.open();
    const restored = await readItem(restarted, a.id);
    assert.equal(restored.effectiveStatus, 'waiting');
    assert.equal(restored.execution?.runId, originalRun.id);
    assert.equal(calls, 1);
    const signal = {
      action: 'signal',
      id: 'announcement-001',
      name: 'vendor.announcement',
      payload: { url: 'https://example.invalid/advisory/1' },
    };
    await act(restarted, a.id, signal);
    const finished = await eventually(
      () => readItem(restarted, a.id),
      (v) => v.execution?.status === 'completed',
    );
    await act(restarted, a.id, signal);
    await rejected(restarted, actionPath(a.id), {
      ...signal,
      payload: { url: 'different' },
    });
    const run = await runRecord(restarted, finished);
    assert.equal(run.id, originalRun.id);
    assert.deepEqual(run.inputs, originalRun.inputs);
    assert.deepEqual(run.workItem, originalRun.workItem);
    assert.equal(run.workItem?.materials.length, 1);
    assert.equal(finished.materials.length, 2);
    assert.equal(run.signals?.length, 1);
    assert.ok(run.signals?.[0].receivedAt);
    assert.equal(calls, 1);
    assert.equal(
      (await readItem(restarted, a.id)).history.filter(
        (h) => h.kind === 'milestone',
      ).length,
      2,
    );
    assert.equal(finished.status, 'open');
  } finally {
    await f.cleanup();
  }
});

test('L3 离线到期后恢复同一次运行，停止等待拒绝迟到消息并阻止后续里程碑', async () => {
  const f = await fixture();
  try {
    const m = await method(f.server, lifecycle(0.15));
    const a = await item(f.server, m.work.id, 'CVE-TIMER');
    await act(f.server, a.id, { action: 'run' });
    const waiting = await eventually(
      () => readItem(f.server, a.id),
      (v) => v.effectiveStatus === 'waiting',
    );
    await f.server.runs.close();
    await delay(200);
    const restarted = await f.open();
    const done = await eventually(
      () => readItem(restarted, a.id),
      (v) => v.execution?.status === 'completed',
    );
    assert.equal(done.execution?.runId, waiting.execution?.runId);
    assert.equal(
      (await runRecord(restarted, done)).waits?.[0].releasedBy,
      'timer',
    );
    const b = await item(restarted, m.work.id, 'CVE-STOP');
    await act(restarted, b.id, { action: 'run' });
    await eventually(
      () => readItem(restarted, b.id),
      (v) => v.effectiveStatus === 'waiting',
    );
    await act(restarted, b.id, { action: 'stop' });
    await rejected(restarted, actionPath(b.id), {
      action: 'signal',
      id: 'late',
      name: 'vendor.announcement',
    });
    await delay(200);
    const stopped = await readItem(restarted, b.id);
    assert.equal(stopped.execution?.status, 'cancelled');
    assert.equal(stopped.stage, '已完成调查');
    assert.equal(
      stopped.history.filter((h) => h.kind === 'milestone').length,
      1,
    );
  } finally {
    await f.cleanup();
  }
});

test('L4 schema 失败不提交进展；补证据换方法保留旧快照；节点 preview 不写业务对象', async () => {
  let invalid = true;
  const f = await fixture(async (c) =>
    invalid ? { evidence: 42 } : evidenceExecutor(c),
  );
  try {
    const m = await method(f.server, immediate()),
      a = await item(f.server, m.work.id, 'CVE-REVISION');
    await act(f.server, a.id, { action: 'run' });
    const failed = await eventually(
      () => readItem(f.server, a.id),
      (v) => v.execution?.status === 'failed',
    );
    assert.equal(
      failed.history.filter((h) => h.kind === 'milestone').length,
      0,
    );
    const oldRun = await runRecord(f.server, failed);
    assert.match(oldRun.results[0].error ?? '', /schema|输出|类型|校验/i);
    invalid = false;
    await act(f.server, a.id, {
      action: 'addEvidence',
      materials: ['第二份经确认的公告'],
    });
    const newMethod = await method(f.server, immediate());
    await act(f.server, a.id, {
      action: 'method',
      workflowId: newMethod.work.id,
    });
    await act(f.server, a.id, { action: 'run' });
    const done = await eventually(
      () => readItem(f.server, a.id),
      (v) => v.execution?.status === 'completed',
    );
    assert.equal(done.id, a.id);
    assert.equal(done.runs.length, 2);
    assert.deepEqual(
      done.runs.map((r) => r.workId),
      [m.work.id, newMethod.work.id],
    );
    assert.deepEqual(
      (await request<Snapshot>(f.server, `/api/works/${m.work.id}`)).work
        .runs[0],
      oldRun,
    );
    const fresh = await runRecord(f.server, done);
    assert.equal(fresh.workItem?.materials.length, 2);
    const before = await readItem(f.server, a.id);
    const previewId = await f.server.runs.start(newMethod.work.id, {
      definitionId: newMethod.work.draftId!,
      scope: { nodeId: 'investigated' },
      inputs: {
        input: [
          {
            sampleId: 'preview',
            value: { evidence: '仅供试验' },
            materialIds: [],
            sourceResultIds: [],
          },
        ],
      },
      workItem: fresh.workItem,
      effectMode: 'preview',
    });
    await f.server.runs.wait(previewId);
    assert.deepEqual(await readItem(f.server, a.id), before);
  } finally {
    await f.cleanup();
  }
});

test('H6/H11 工作项事件 ID 跨运行去重，旧消息重投不唤醒新的等待', async () => {
  const f = await fixture();
  try {
    const m = await method(f.server, lifecycle());
    const a = await item(f.server, m.work.id, 'CVE-EVENT-REDELIVERY');
    await act(f.server, a.id, { action: 'run' });
    const firstWaiting = await eventually(
      () => readItem(f.server, a.id),
      (view) => view.effectiveStatus === 'waiting',
    );
    const originalMessage = {
      action: 'signal',
      id: 'external-announcement-1',
      name: 'vendor.announcement',
      payload: { version: '1.1', advisory: '公告一' },
    };
    await act(f.server, a.id, originalMessage);
    const firstFinished = await eventually(
      () => readItem(f.server, a.id),
      (view) => view.execution?.status === 'completed',
    );
    const firstRun = await runRecord(f.server, firstFinished);
    assert.equal(firstRun.id, firstWaiting.execution?.runId);
    // Method changes do not change the item's event identity scope.
    const nextMethod = await method(f.server, lifecycle());
    await act(f.server, a.id, {
      action: 'method',
      workflowId: nextMethod.work.id,
    });
    await act(f.server, a.id, { action: 'run' });
    const secondWaiting = await eventually(
      () => readItem(f.server, a.id),
      (view) => view.effectiveStatus === 'waiting',
    );
    assert.notEqual(secondWaiting.execution?.runId, firstRun.id);
    const historyBefore = structuredClone(secondWaiting.history);
    await act(f.server, a.id, originalMessage);
    await f.server.runs.wait(secondWaiting.execution!.runId);
    const afterRedelivery = await readItem(f.server, a.id);
    assert.equal(afterRedelivery.effectiveStatus, 'waiting');
    assert.deepEqual(afterRedelivery.history, historyBefore);
    assert.equal(
      (await runRecord(f.server, afterRedelivery)).signals?.length,
      0,
    );
    await rejected(f.server, actionPath(a.id), {
      ...originalMessage,
      payload: { version: '2.0', advisory: '不可覆盖的不同公告' },
    });
    assert.equal((await readItem(f.server, a.id)).effectiveStatus, 'waiting');
    await act(f.server, a.id, {
      ...originalMessage,
      id: 'external-announcement-2',
      payload: { version: '2.0', advisory: '公告二' },
    });
    const secondFinished = await eventually(
      () => readItem(f.server, a.id),
      (view) => view.execution?.status === 'completed',
    );
    assert.deepEqual(
      (await runRecord(f.server, secondFinished)).signals?.map(
        (signal) => signal.id,
      ),
      ['external-announcement-2'],
    );
    const previousMethod = await request<Snapshot>(
      f.server,
      `/api/works/${m.work.id}`,
    );
    assert.deepEqual(previousMethod.work.runs[0], firstRun);
  } finally {
    await f.cleanup();
  }
});
