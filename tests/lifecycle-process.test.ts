import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type {
  Definition,
  Run,
  Snapshot,
  WorkItemView,
} from '../src/shared/records.ts';

function definition(timeoutSeconds?: number): Definition {
  return {
    schemaVersion: 1,
    inputs: ['materials'],
    nodes: [
      {
        id: 'investigate',
        label: '调查材料',
        kind: 'agent',
        mode: 'each',
        operation: 'map',
        task: '提取证据',
        expectedOutput: {
          type: 'object',
          required: ['evidence'],
          properties: { evidence: { type: 'string' } },
        },
      },
      {
        id: 'investigated',
        label: '记录调查',
        kind: 'milestone',
        mode: 'all',
        milestone: { stage: '已调查', summary: '已有调查证据' },
      },
      {
        id: 'wait',
        label: '等待公告',
        kind: 'wait',
        mode: 'all',
        wait: {
          event: 'vendor.advisory',
          reason: '等待公告或复核期限',
          ...(timeoutSeconds ? { timeoutSeconds } : {}),
        },
      },
      {
        id: 'reviewed',
        label: '完成复核',
        kind: 'milestone',
        mode: 'all',
        milestone: { stage: '已复核', summary: '待人工确认完成条件' },
      },
    ],
    edges: [
      { from: ['$input', 'materials'], to: ['investigate', 'input'] },
      { from: ['investigate', 'output'], to: ['investigated', 'input'] },
      { from: ['investigated', 'output'], to: ['wait', 'input'] },
      { from: ['wait', 'output'], to: ['reviewed', 'input'] },
    ],
    outputs: { result: ['reviewed', 'output'] },
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'flow-process-'));
  const entry = join(root, 'child.mjs');
  const callsPath = join(root, 'calls.ndjson');
  // Only model generation is deterministic. The child runs the real Hono HTTP
  // app, persistence, scheduler and work-item module in a separate OS process.
  await writeFile(
    entry,
    `
import { appendFile } from 'node:fs/promises';
import { createApplication } from ${JSON.stringify(new URL('../src/server/index.ts', import.meta.url).href)};
import { serve } from ${JSON.stringify(import.meta.resolve('@hono/node-server'))};
const application = await createApplication({
  dataRoot: ${JSON.stringify(root)},
  executeNode: async context => {
    await appendFile(${JSON.stringify(callsPath)}, JSON.stringify({pid:process.pid,runId:context.runId,instanceId:context.instanceId}) + '\\n');
    return {evidence:String(context.inputs.input[0].value)};
  }
});
serve({fetch:application.app.fetch,port:0,hostname:'127.0.0.1'}, address => {
  process.send({port:address.port,pid:process.pid});
});
`,
  );
  const children: ChildProcess[] = [];
  let current: ChildProcess | undefined;
  let base = '';
  async function open() {
    const child = fork(entry, [], {
      execArgv: ['--import', import.meta.resolve('tsx')],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    children.push(child);
    current = child;
    let stderr = '';
    child.stderr?.on('data', (data) => {
      stderr = (stderr + String(data)).slice(-4000);
    });
    child.stdout?.resume();
    const ready = await new Promise<{ port: number; pid: number }>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error(`Child startup timed out: ${stderr}`)),
          8000,
        );
        const onExit = () => {
          clearTimeout(timer);
          reject(Error(`Child exited during startup: ${stderr}`));
        };
        child.once('exit', onExit);
        child.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once('message', (value) => {
          clearTimeout(timer);
          child.off('exit', onExit);
          resolve(value as { port: number; pid: number });
        });
      },
    );
    base = `http://127.0.0.1:${ready.port}`;
    return ready;
  }
  async function kill() {
    if (!current || current.exitCode !== null || current.signalCode !== null)
      return;
    const exited = once(current, 'exit');
    assert.equal(current.kill('SIGKILL'), true);
    const [, signal] = await exited;
    assert.equal(signal, 'SIGKILL');
  }
  async function request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      ...(body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    assert.equal(response.ok, true, `${path}: ${JSON.stringify(result)}`);
    return result as T;
  }
  async function until(id: string, status: string) {
    const deadline = Date.now() + 5000;
    let item: WorkItemView;
    do {
      item = await request<WorkItemView>(`/api/items/${id}`);
      if (item.execution?.status === status) return item;
      await delay(15);
    } while (Date.now() < deadline);
    assert.fail(`Expected ${status}, got ${JSON.stringify(item.execution)}`);
  }
  async function create(key: string, timeoutSeconds?: number) {
    const method = await request<Snapshot>('/api/works', {
      goal: key,
      materials: ['method sample'],
    });
    await request(`/api/works/${method.work.id}/actions`, {
      action: 'saveDraft',
      definition: definition(timeoutSeconds),
    });
    const item = await request<WorkItemView>('/api/items', {
      key,
      title: key,
      workflowId: method.work.id,
      goal: '调查并跟踪',
      criteria: ['结论有证据'],
      materials: [`${key} 证据一`, `${key} 证据二`],
    });
    await request(`/api/items/${item.id}/actions`, { action: 'run' });
    return until(item.id, 'waiting');
  }
  async function record(item: WorkItemView): Promise<Run> {
    const ref = item.runs.at(-1)!;
    const snapshot = await request<Snapshot>(`/api/works/${ref.workId}`);
    return snapshot.work.runs.find((r) => r.id === ref.runId)!;
  }
  return {
    open,
    kill,
    request,
    until,
    create,
    record,
    calls: async () =>
      (await readFile(callsPath, 'utf8'))
        .trim()
        .split('\n')
        .map(
          (line) =>
            JSON.parse(line) as {
              pid: number;
              runId: string;
              instanceId: string;
            },
        ),
    cleanup: async () => {
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit');
          child.kill('SIGKILL');
          await exited;
        }
      await rm(root, { recursive: true, force: true });
    },
  };
}

test(
  '真实子进程 SIGKILL 重启：事件等待保留、离线定时恢复且成功 Agent 实例不重跑',
  { timeout: 20000 },
  async () => {
    const f = await fixture();
    try {
      const firstProcess = await f.open();
      const eventItem = await f.create('PROCESS-EVENT');
      const timerItem = await f.create('PROCESS-TIMER', 0.8);
      const beforeEvent = await f.record(eventItem),
        beforeTimer = await f.record(timerItem);
      const calls = await f.calls();
      assert.equal(calls.length, 4);
      assert.equal(new Set(calls.map((c) => c.pid)).size, 1);
      assert.ok(calls.every((c) => c.pid === firstProcess.pid));
      assert.equal(beforeTimer.waits![0].status, 'pending');
      const dueAt = Date.parse(beforeTimer.waits![0].dueAt!);
      await f.kill();
      await delay(Math.max(0, dueAt - Date.now()) + 80);
      const secondProcess = await f.open();
      assert.notEqual(secondProcess.pid, firstProcess.pid);
      const recoveredEvent = await f.until(eventItem.id, 'waiting');
      const completedTimer = await f.until(timerItem.id, 'completed');
      assert.equal(recoveredEvent.execution!.runId, beforeEvent.id);
      assert.equal(completedTimer.execution!.runId, beforeTimer.id);
      const eventStillWaiting = await f.record(recoveredEvent);
      assert.deepEqual(eventStillWaiting.waits, beforeEvent.waits);
      assert.deepEqual(eventStillWaiting.results, beforeEvent.results);
      await f.request(`/api/items/${eventItem.id}/actions`, {
        action: 'signal',
        id: 'announcement-1',
        name: 'vendor.advisory',
        payload: { fixedVersion: '2.0' },
      });
      const completedEvent = await f.until(eventItem.id, 'completed');
      const afterEvent = await f.record(completedEvent),
        afterTimer = await f.record(completedTimer);
      for (const [before, after] of [
        [beforeEvent, afterEvent],
        [beforeTimer, afterTimer],
      ]) {
        assert.equal(after.id, before.id);
        assert.deepEqual(
          after.results.filter((r) =>
            before.results.some((old) => old.id === r.id),
          ),
          before.results,
        );
        assert.equal(
          after.results.filter((r) => r.nodeId === 'investigate').length,
          2,
        );
      }
      assert.equal(afterEvent.waits![0].releasedBy, 'event');
      assert.equal(afterTimer.waits![0].releasedBy, 'timer');
      assert.equal(
        (
          afterTimer.results.find((r) => r.nodeId === 'wait')!.outputs.event[0]
            .value as { type: string }
        ).type,
        'timer',
      );
      assert.equal(completedEvent.stage, '已复核');
      assert.equal(completedTimer.stage, '已复核');
      assert.equal(completedEvent.status, 'open');
      assert.equal(
        completedEvent.history.filter((h) => h.kind === 'milestone').length,
        2,
      );
      assert.equal(
        completedTimer.history.filter((h) => h.kind === 'milestone').length,
        2,
      );
      assert.deepEqual(
        await f.calls(),
        calls,
        'The restarted OS process must not repeat completed Agent calls',
      );
    } finally {
      await f.cleanup();
    }
  },
);
