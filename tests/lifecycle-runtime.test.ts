import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index.ts';
import { createFlow, checkDefinition } from '../src/server/flow/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createRuns, type RunHooks } from '../src/server/runs/index.ts';
import type {
  Definition,
  FlowNode,
  Json,
  NodeExecution,
  Run,
  WorkItemInput,
} from '../src/shared/records.ts';
const agent: FlowNode = {
  id: 'classify',
  label: '分类',
  kind: 'agent',
  mode: 'each',
  task: '分类',
  operation: 'map',
  expectedOutput: {
    type: 'object',
    required: ['label'],
    properties: { label: { type: 'string' } },
  },
};
const milestone: FlowNode = {
  id: 'progress',
  label: '进展',
  kind: 'milestone',
  mode: 'all',
  milestone: { stage: '已调查', summary: '证据已收集' },
};
const wait: FlowNode = {
  id: 'wait',
  label: '等待公告',
  kind: 'wait',
  mode: 'all',
  wait: { event: 'advisory', reason: '等待厂商', timeoutSeconds: 86400 },
};
function chain(nodes: FlowNode[]): Definition {
  return {
    schemaVersion: 1,
    inputs: ['materials'],
    nodes,
    edges: nodes.map((n, i) => ({
      from: i ? [nodes[i - 1].id, 'output'] : ['$input', 'materials'],
      to: [n.id, 'input'],
    })),
    outputs: { result: [nodes.at(-1)!.id, 'output'] },
  };
}
async function setup(
  definition: Definition,
  execute: (c: NodeExecution) => Promise<Json> = async () => ({ label: 'ok' }),
  hooks: RunHooks = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'lifecycle-')),
    files = createFiles(dir),
    flow = createFlow(files);
  const work = await createWorkService(files).createWork('方法', [
    'one',
    'two',
    'three',
  ]);
  const id = await flow.saveDraft(work.id, undefined, definition);
  const item: WorkItemInput = {
    id: 'item-a',
    key: 'CVE-example',
    title: '调查',
    goal: '确认影响',
    revision: 1,
    data: {},
    materials: work.materials,
  };
  const inputs = {
    materials: work.materials.map((m) => ({
      sampleId: m.id,
      value: m.text,
      materialIds: [m.id],
      sourceResultIds: [],
    })),
  };
  let runs = createRuns(files, execute, hooks);
  return {
    files,
    work,
    id,
    item,
    inputs,
    get runs() {
      return runs;
    },
    read: async (runId: string) =>
      (await files.read(work.id)).runs.find((r) => r.id === runId)!,
    start: () =>
      runs.start(work.id, {
        definitionId: id,
        scope: 'full',
        inputs,
        workItem: item,
        effectMode: 'commit',
      }),
    restart: async () => {
      runs.close();
      await files.onServerStart();
      runs = createRuns(files, execute, hooks);
      await runs.recover();
    },
    cleanup: async () => {
      runs.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
test('持久事件等待：重启保留已完成调用，事件去重/冲突，事件输出及进展来源', async () => {
  let calls = 0;
  const committed: string[] = [];
  const t = await setup(
    chain([agent, wait, milestone]),
    async (c) => {
      calls++;
      assert.equal(c.workItem?.id, 'item-a');
      return { label: String(c.inputs.input[0].value) };
    },
    {
      onMilestone: async (_, run, node, inputs) => {
        committed.push(`${run.id}:${node.id}`);
        assert.equal(inputs.input.length, 3);
      },
    },
  );
  try {
    const id = await t.start();
    await t.runs.wait(id);
    assert.equal((await t.read(id)).status, 'waiting');
    assert.equal(calls, 3);
    await t.restart();
    await t.runs.wait(id);
    assert.equal((await t.read(id)).status, 'waiting');
    assert.equal(calls, 3);
    await assert.rejects(
      t.runs.signal(t.work.id, id, { id: 'wrong', name: 'unknown' }),
      /匹配/,
    );
    await t.runs.signal(t.work.id, id, {
      id: 'e1',
      name: 'advisory',
      payload: { version: '1.2' },
    });
    await t.runs.wait(id);
    await t.runs.signal(t.work.id, id, {
      id: 'e1',
      name: 'advisory',
      payload: { version: '1.2' },
    });
    await t.runs.wait(id);
    await assert.rejects(
      t.runs.signal(t.work.id, id, {
        id: 'e1',
        name: 'advisory',
        payload: { version: 'other' },
      }),
      /不同/,
    );
    const run = await t.read(id);
    assert.equal(run.status, 'completed');
    assert.equal(run.signals?.length, 1);
    assert.equal(committed.length, 1);
    assert.equal(calls, 3);
    assert.deepEqual(
      run.results.find((r) => r.nodeId === 'wait')!.outputs.event[0].value,
      {
        type: 'event',
        id: 'e1',
        name: 'advisory',
        payload: { version: '1.2' },
        receivedAt: run.signals![0].receivedAt,
      },
    );
  } finally {
    await t.cleanup();
  }
});
test('离线跨45天后恢复截止等待，停止后跨月仍阻止迟到事件和里程碑', async () => {
  let time = Date.parse('2026-09-20T00:00:00Z'),
    commits = 0;
  const t = await setup(chain([wait, milestone]), undefined, {
    now: () => time,
    onMilestone: async () => {
      commits++;
    },
  });
  try {
    const id = await t.start();
    await t.runs.wait(id);
    assert.equal(
      (await t.read(id)).waits![0].dueAt,
      '2026-09-21T00:00:00.000Z',
    );
    time += 45 * 86400_000;
    await t.restart();
    await t.runs.wait(id);
    assert.equal((await t.read(id)).status, 'completed');
    assert.equal(commits, 1);
    assert.equal(
      ((await t.read(id)).results[0].outputs.event[0].value as { type: string })
        .type,
      'timer',
    );
    const second = await t.start();
    await t.runs.wait(second);
    await t.runs.stop(t.work.id, second);
    time += 45 * 86400_000;
    await t.restart();
    await assert.rejects(
      t.runs.signal(t.work.id, second, { id: 'late', name: 'advisory' }),
      /不能/,
    );
    assert.equal((await t.read(second)).status, 'cancelled');
    assert.equal(commits, 1);
  } finally {
    await t.cleanup();
  }
});
test('试运行/无工作项流程不提交业务进展或持久等待', async () => {
  let commits = 0;
  const t = await setup(chain([wait, milestone]), undefined, {
    onMilestone: async () => {
      commits++;
    },
  });
  try {
    const id = await t.runs.start(t.work.id, {
      definitionId: t.id,
      scope: 'full',
      inputs: t.inputs,
      workItem: t.item,
      effectMode: 'preview',
    });
    await t.runs.wait(id);
    assert.equal((await t.read(id)).status, 'completed');
    assert.equal(commits, 0);
    assert.deepEqual((await t.read(id)).waits, []);
  } finally {
    await t.cleanup();
  }
});
test('活跃调用重启后显式继续，仅重做不确定实例；快照材料保持固定', async () => {
  let calls = 0,
    entered!: () => void,
    unblock!: (j: Json) => void;
  const ready = new Promise<void>((r) => (entered = r));
  const t = await setup(
    chain([agent, milestone]),
    async (c) => {
      calls++;
      assert.equal(c.materials.length, 3);
      if (calls === 2) {
        entered();
        return new Promise<Json>((r) => (unblock = r));
      }
      return { label: String(c.inputs.input[0].value) };
    },
    { onMilestone: async () => {} },
  );
  try {
    const id = await t.start();
    await ready;
    await t.restart();
    assert.equal((await t.read(id)).status, 'interrupted');
    await t.files.change(t.work.id, (w) => {
      w.materials = [];
    });
    await t.runs.resume(t.work.id, id);
    await t.runs.wait(id);
    unblock({ label: 'late' });
    await new Promise((r) => setImmediate(r));
    const run = await t.read(id);
    assert.equal(run.status, 'completed');
    assert.equal(calls, 4);
    assert.equal(
      run.results.filter(
        (r) => r.nodeId === 'classify' && r.status === 'completed',
      ).length,
      3,
    );
    assert.equal(
      run.results.filter((r) => r.status === 'interrupted').length,
      1,
    );
  } finally {
    await t.cleanup();
  }
});
test('有限并发和输入顺序，map 数组不展开，flatMap 显式展开，schema 失败阻断进展', async () => {
  let active = 0,
    maximum = 0;
  const map: FlowNode = {
    ...agent,
    expectedOutput: { type: 'array', items: { type: 'string' } },
    concurrency: 2,
  };
  const def = chain([
    map,
    {
      id: 'aggregate',
      kind: 'agent',
      label: '汇总',
      mode: 'all',
      operation: 'aggregate',
      task: '汇总',
      inputSchema: {
        type: 'array',
        items: { type: 'array', items: { type: 'string' } },
      },
    },
  ]);
  const t = await setup(def, async (c) => {
    if (c.node.id === 'aggregate') return c.inputs.input.map((i) => i.value);
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((r) =>
      setTimeout(r, c.inputs.input[0].value === 'one' ? 25 : 1),
    );
    active--;
    return [c.inputs.input[0].value];
  });
  try {
    const id = await t.start();
    await t.runs.wait(id);
    let run = await t.read(id);
    assert.equal(maximum, 2);
    assert.deepEqual(
      run.results.find((r) => r.nodeId === 'aggregate')!.outputs.output[0]
        .value,
      [['one'], ['two'], ['three']],
    );
    const flat = chain([{ ...map, operation: 'flatMap' }, milestone]);
    const fid = await t.files.writeDefinition(t.work.id, flat);
    let commits = 0;
    const runner = createRuns(
      t.files,
      async (c) => [c.inputs.input[0].value, 'extra'],
      {
        onMilestone: async () => {
          commits++;
        },
      },
    );
    const rid = await runner.start(t.work.id, {
      definitionId: fid,
      scope: 'full',
      inputs: t.inputs,
      workItem: t.item,
      effectMode: 'commit',
    });
    await runner.wait(rid);
    run = await t.read(rid);
    assert.equal(
      run.results.find((r) => r.nodeId === 'progress')!.input.input.length,
      6,
    );
    assert.equal(commits, 1);
    runner.close();
    const bad = chain([{ ...agent, concurrency: 3 }, milestone]);
    const bid = await t.files.writeDefinition(t.work.id, bad);
    const badrunner = createRuns(
      t.files,
      async (c) =>
        c.inputs.input[0].value === 'two' ? { label: 3 } : { label: 'ok' },
      {
        onMilestone: async () => {
          commits++;
        },
      },
    );
    const badid = await badrunner.start(t.work.id, {
      definitionId: bid,
      scope: 'full',
      inputs: t.inputs,
      workItem: t.item,
      effectMode: 'commit',
    });
    await badrunner.wait(badid);
    run = await t.read(badid);
    assert.equal(run.status, 'failed');
    assert.equal(run.nodeStates.progress, 'blocked');
    assert.equal(run.results.filter((r) => r.status === 'completed').length, 2);
    assert.match(
      run.results.find((r) => r.status === 'failed')!.error!,
      /schema/,
    );
    assert.equal(commits, 1);
    badrunner.close();
  } finally {
    await t.cleanup();
  }
});
test('等待不阻塞独立分支，不同工作项共用方法可并发', async () => {
  const def = chain([wait]);
  def.nodes.push({ ...milestone, id: 'independent' });
  def.edges.push({
    from: ['$input', 'materials'],
    to: ['independent', 'input'],
  });
  const commits: string[] = [];
  const t = await setup(def, undefined, {
    onMilestone: async (_, run) => {
      commits.push(run.workItem!.id);
    },
  });
  try {
    const a = await t.start();
    const b = await t.runs.start(t.work.id, {
      definitionId: t.id,
      scope: 'full',
      inputs: t.inputs,
      workItem: { ...t.item, id: 'item-b' },
      effectMode: 'commit',
    });
    await Promise.all([t.runs.wait(a), t.runs.wait(b)]);
    assert.deepEqual(commits.sort(), ['item-a', 'item-b']);
    assert.equal((await t.read(a)).status, 'waiting');
    assert.equal((await t.read(b)).status, 'waiting');
    await t.runs.stop(t.work.id, a);
    await t.runs.signal(t.work.id, b, { id: 'b', name: 'advisory' });
    await t.runs.wait(b);
    assert.equal((await t.read(b)).status, 'completed');
    assert.equal((await t.read(a)).status, 'cancelled');
  } finally {
    await t.cleanup();
  }
});
test('静态校验拒绝无效 schema/并发/等待及已知不兼容连接', () => {
  const def = chain([
    { ...agent, expectedOutput: { type: 'string' } },
    { ...agent, id: 'second', inputSchema: { type: 'number' } },
  ]);
  assert.ok(checkDefinition(def).some((i) => i.message.includes('不相容')));
  assert.ok(
    checkDefinition(
      chain([{ ...wait, wait: { event: '', reason: '', timeoutSeconds: -1 } }]),
    ).length,
  );
  assert.ok(
    checkDefinition(
      chain([
        { ...agent, concurrency: 0, inputSchema: { type: 'not-a-type' } },
      ]),
    ).length >= 2,
  );
});

test('在线截止时间自动唤醒而不要求客户端轮询推进', async () => {
  const t = await setup(
    chain([
      { ...wait, wait: { ...wait.wait!, timeoutSeconds: 0.02 } },
      milestone,
    ]),
    undefined,
    { onMilestone: async () => {} },
  );
  try {
    const id = await t.start();
    await t.runs.wait(id);
    const deadline = Date.now() + 1000;
    while (
      ['waiting', 'running'].includes((await t.read(id)).status) &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal((await t.read(id)).status, 'completed');
    assert.equal((await t.read(id)).waits![0].releasedBy, 'timer');
  } finally {
    await t.cleanup();
  }
});

test('未知 schema keyword 明确拒绝，合理 union 可运行', () => {
  assert.ok(
    checkDefinition(
      chain([{ ...agent, expectedOutput: { type: 'string', minLenght: 3 } }]),
    ).some(
      (i) => i.field === 'expectedOutput' && i.message.includes('minLenght'),
    ),
  );
  assert.ok(
    checkDefinition(
      chain([
        {
          ...agent,
          inputSchema: { type: ['string', 'null'] },
          expectedOutput: { type: ['object', 'null'] },
        },
      ]),
    ).length === 0,
  );
});

test('事件释放和停止交错不会推进下游；重复 recover 不替换活跃调度', async () => {
  let commits = 0;
  const t = await setup(chain([wait, milestone]), undefined, {
    onMilestone: async () => {
      commits++;
    },
  });
  try {
    const id = await t.start();
    await t.runs.wait(id);
    await Promise.all([t.runs.recover(), t.runs.recover()]);
    await t.runs.wait(id);
    // The signal persists first, while stop removes the scheduler's controller before its job can start.
    const released = t.runs.signal(t.work.id, id, {
      id: 'racing',
      name: 'advisory',
    });
    const stopped = t.runs.stop(t.work.id, id);
    await Promise.all([released, stopped]);
    await t.runs.wait(id);
    assert.equal((await t.read(id)).status, 'cancelled');
    assert.equal(commits, 0);
  } finally {
    await t.cleanup();
  }
});

test('45天等待按原生定时器上限分段，首段唤醒不得提前释放', async (context) => {
  const maximumDelay = 2_147_483_647;
  const totalDelay = 45 * 86400_000;
  let time = Date.parse('2026-09-20T00:00:00Z'),
    commits = 0;
  const scheduled: { delay: number; fire: () => void }[] = [];
  const nativeTimeout = globalThis.setTimeout;
  context.mock.method(
    globalThis,
    'setTimeout',
    (callback: () => void, milliseconds: number) => {
      scheduled.push({ delay: milliseconds, fire: callback });
      return nativeTimeout(callback, milliseconds);
    },
  );
  const t = await setup(
    chain([
      { ...wait, wait: { ...wait.wait!, timeoutSeconds: totalDelay / 1000 } },
      milestone,
    ]),
    undefined,
    {
      now: () => time,
      onMilestone: async () => {
        commits++;
      },
    },
  );
  try {
    const id = await t.start();
    await t.runs.wait(id);
    assert.equal(
      (await t.read(id)).waits![0].dueAt,
      '2026-11-04T00:00:00.000Z',
    );
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].delay, maximumDelay);
    time += maximumDelay;
    scheduled[0].fire();
    await t.runs.wait(id);
    assert.equal((await t.read(id)).status, 'waiting');
    assert.equal((await t.read(id)).waits![0].status, 'pending');
    assert.equal(commits, 0);
    assert.equal(scheduled.length, 2);
    assert.equal(scheduled[1].delay, totalDelay - maximumDelay);
    time += totalDelay - maximumDelay;
    scheduled[1].fire();
    await t.runs.wait(id);
    assert.equal((await t.read(id)).status, 'completed');
    assert.equal((await t.read(id)).waits![0].releasedBy, 'timer');
    assert.equal(commits, 1);
    assert.ok(
      scheduled.every(
        (timer) => timer.delay >= 1 && timer.delay <= maximumDelay,
      ),
    );
  } finally {
    await t.cleanup();
  }
});

test('工作项失败实例局部重试沿用冻结工作项上下文，不误读同编号的方法材料或提交进展', async () => {
  const seen: {
    item: WorkItemInput | undefined;
    materials: NodeExecution['materials'];
    input: NodeExecution['inputs'];
  }[] = [];
  let commits = 0;
  const t = await setup(
    chain([agent, milestone]),
    async (context) => {
      seen.push({
        item: structuredClone(context.workItem),
        materials: structuredClone(context.materials),
        input: structuredClone(context.inputs),
      });
      if (seen.length === 1) throw Error('第一次请求失败');
      return { label: '恢复成功' };
    },
    {
      onMilestone: async () => {
        commits++;
      },
    },
  );
  try {
    const materialId = t.work.materials[0].id;
    assert.equal(materialId, 'M01');
    t.item.materials = [{ id: materialId, text: '工作项 M01 原始证据' }];
    t.item.goal = '原工作项目标：确认产品 A 影响';
    t.item.revision = 7;
    t.item.data = { product: 'A' };
    t.inputs.materials = [
      {
        sampleId: materialId,
        value: '工作项 M01 原始证据',
        materialIds: [materialId],
        sourceResultIds: [],
      },
    ];
    const id = await t.start();
    await t.runs.wait(id);
    const old = await t.read(id);
    assert.equal(old.status, 'failed');
    t.item.materials[0].text = '运行后补充的证据';
    t.item.goal = '运行后的新目标';
    t.item.revision = 8;
    await t.files.change(t.work.id, (work) => {
      work.materials[0].text = '方法示例 M01：不属于工作项';
      work.goal = '方法目标';
    });
    const retryId = await t.runs.retry(
      t.work.id,
      id,
      old.results
        .filter((result) => result.status === 'failed')
        .map((result) => result.id),
    );
    await t.runs.wait(retryId);
    const retried = await t.read(retryId);
    assert.equal(retried.status, 'completed');
    assert.equal(retried.effectMode, 'preview');
    assert.deepEqual(retried.scope, { nodeId: 'classify' });
    assert.deepEqual(retried.workItem, old.workItem);
    assert.equal(seen.length, 2);
    assert.deepEqual(seen[1], seen[0]);
    assert.equal(seen[1].item!.goal, '原工作项目标：确认产品 A 影响');
    assert.equal(seen[1].item!.revision, 7);
    assert.deepEqual(seen[1].materials, [
      { id: 'M01', text: '工作项 M01 原始证据' },
    ]);
    assert.equal(commits, 0);
  } finally {
    await t.cleanup();
  }
});

test('所选结果续做/比较继承一致工作项快照，混合身份/修订/方法样本明确拒绝', async () => {
  const seen: NodeExecution[] = [];
  const t = await setup(
    chain([{ ...agent, expectedOutput: undefined }]),
    async (context) => {
      seen.push(context);
      return context.inputs.input[0].value;
    },
  );
  try {
    t.item.materials = [{ id: 'M01', text: '工作项证据' }];
    t.item.goal = '调查原目标';
    t.item.revision = 4;
    t.inputs.materials = [
      {
        sampleId: 'M01',
        value: '工作项证据',
        materialIds: ['M01'],
        sourceResultIds: [],
      },
    ];
    const first = await t.start();
    await t.runs.wait(first);
    const original = await t.read(first);
    const output = original.results[0].outputs.output;
    const preview = await t.runs.start(t.work.id, {
      definitionId: t.id,
      scope: { nodeId: 'classify' },
      inputs: { input: output },
    });
    await t.runs.wait(preview);
    t.runs.reserve(t.work.id, 'comparison-test');
    const compared = await t.runs.start(t.work.id, {
      definitionId: t.id,
      scope: { nodeId: 'classify' },
      inputs: { input: output },
      comparisonId: 'comparison-test',
    });
    await t.runs.wait(compared);
    t.runs.release(t.work.id, 'comparison-test');
    for (const id of [preview, compared]) {
      const run = await t.read(id);
      assert.deepEqual(run.workItem, original.workItem);
      assert.equal(run.effectMode, 'preview');
    }
    for (const context of seen.slice(1)) {
      assert.deepEqual(context.workItem, original.workItem);
      assert.deepEqual(context.materials, [{ id: 'M01', text: '工作项证据' }]);
    }
    const otherItem = await t.runs.start(t.work.id, {
      definitionId: t.id,
      scope: 'full',
      inputs: t.inputs,
      workItem: { ...t.item, id: 'different-item' },
      effectMode: 'commit',
    });
    await t.runs.wait(otherItem);
    const newerItem = await t.runs.start(t.work.id, {
      definitionId: t.id,
      scope: 'full',
      inputs: t.inputs,
      workItem: { ...t.item, revision: 5 },
      effectMode: 'commit',
    });
    await t.runs.wait(newerItem);
    for (const extra of [
      t.inputs.materials,
      (await t.read(otherItem)).results[0].outputs.output,
      (await t.read(newerItem)).results[0].outputs.output,
    ]) {
      await assert.rejects(
        t.runs.start(t.work.id, {
          definitionId: t.id,
          scope: { nodeId: 'classify' },
          inputs: { input: [...output, ...extra] },
        }),
        /无法确定来源上下文/,
      );
    }
    await assert.rejects(
      t.runs.start(t.work.id, {
        definitionId: t.id,
        scope: { nodeId: 'classify' },
        inputs: {
          input: [{ ...output[0], sourceResultIds: ['unknown-result'] }],
        },
      }),
      /结果不存在/,
    );
  } finally {
    await t.cleanup();
  }
});

test('等待/里程碑整批输出 schema 不把透传元素误判成数组，合法 map 连线可运行', async () => {
  for (const control of [wait, milestone]) {
    const def = chain([
      {
        ...control,
        expectedOutput: { type: 'array', items: { type: 'string' } },
      },
      {
        id: 'next',
        label: '逐项透传',
        kind: 'function',
        functionName: 'identity',
        mode: 'each',
        operation: 'map',
        inputSchema: { type: 'string' },
        expectedOutput: { type: 'string' },
      },
    ]);
    assert.deepEqual(
      checkDefinition(def),
      [],
      `${control.kind} output forwards the array's elements`,
    );
    const t = await setup(def);
    try {
      const id = await t.runs.start(t.work.id, {
        definitionId: t.id,
        scope: 'full',
        inputs: t.inputs,
      });
      await t.runs.wait(id);
      const run = await t.read(id);
      assert.equal(run.status, 'completed');
      assert.deepEqual(
        run.results
          .filter((result) => result.nodeId === 'next')
          .map((result) => result.outputs.output[0].value),
        ['one', 'two', 'three'],
      );
    } finally {
      await t.cleanup();
    }
  }
});

test('分支整批输出不符合 expectedOutput 时失败，不能向任一分支传播未校验值', async () => {
  let calls = 0;
  const def: Definition = {
    schemaVersion: 1,
    inputs: ['materials'],
    nodes: [
      {
        id: 'branch',
        label: '条件分流',
        kind: 'branch',
        mode: 'all',
        condition: { field: '', operator: 'exists' },
        inputSchema: { type: 'array', items: { type: 'string' } },
        expectedOutput: { type: 'array', items: { type: 'integer' } },
      },
      { ...agent, id: 'matched' },
      { ...agent, id: 'unmatched' },
    ],
    edges: [
      { from: ['$input', 'materials'], to: ['branch', 'input'] },
      { from: ['branch', 'matched'], to: ['matched', 'input'] },
      { from: ['branch', 'unmatched'], to: ['unmatched', 'input'] },
    ],
    outputs: { yes: ['matched', 'output'], no: ['unmatched', 'output'] },
  };
  const t = await setup(def, async () => {
    calls++;
    return { label: 'should not run' };
  });
  try {
    const id = await t.start();
    await t.runs.wait(id);
    const run = await t.read(id);
    assert.equal(run.status, 'failed');
    assert.equal(run.nodeStates.branch, 'failed');
    assert.equal(run.nodeStates.matched, 'blocked');
    assert.equal(run.nodeStates.unmatched, 'blocked');
    assert.equal(calls, 0);
    assert.deepEqual(run.results[0].outputs, {});
    assert.match(run.results[0].error!, /输出不符合 schema/);
  } finally {
    await t.cleanup();
  }
});
