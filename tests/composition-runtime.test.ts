import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index.ts';
import { createFlow, checkDefinition } from '../src/server/flow/index.ts';
import { createRuns } from '../src/server/runs/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { nodeInputPorts, nodeOutputPorts } from '../src/shared/node-ports.ts';
import type {
  Definition,
  FlowNode,
  Inputs,
  Json,
  NodeExecution,
  WorkItemInput,
} from '../src/shared/records.ts';

const inputs = (values: Record<string, Json[]>): Inputs =>
  Object.fromEntries(
    Object.entries(values).map(([p, list]) => [
      p,
      list.map((value, i) => ({
        value,
        sampleId: `${p}-${i}`,
        materialIds: [`${p}-${i}`],
        sourceResultIds: [],
      })),
    ]),
  );
async function setup(
  t: TestContext,
  execute: (ctx: NodeExecution) => Promise<Json> = async () => {
    throw Error('unexpected agent');
  },
) {
  const root = await mkdtemp(join(tmpdir(), 'flowcraft-composition-'));
  const files = createFiles(root),
    flow = createFlow(files),
    work = createWorkService(files);
  const caller = await work.createWork('composition', []),
    method = await work.createWork('reusable', []);
  await files.change(caller.id, (w) => {
    w.materials = ['input', 'targets', 'facts'].flatMap((p) =>
      Array.from({ length: 10 }, (_, i) => ({
        id: `${p}-${i}`,
        text: `${p} material ${i}`,
      })),
    );
  });
  const runs = createRuns(files, execute);
  t.after(async () => {
    runs.close();
    await rm(root, { recursive: true, force: true });
  });
  return { root, files, flow, work, caller, method, runs };
}
const callee = (): Definition => ({
  schemaVersion: 1,
  inputs: ['targets', 'facts'],
  nodes: [
    {
      id: 'collect',
      label: 'collect',
      kind: 'function',

      operation: 'aggregate',
      functionName: 'collect',
      inputNames: ['targets', 'facts'],
    },
    {
      id: 'facts',
      label: 'facts',
      kind: 'function',

      operation: 'map',
      functionName: 'identity',
    },
  ],
  edges: [
    { from: ['$input', 'targets'], to: ['collect', 'targets'] },
    { from: ['$input', 'facts'], to: ['collect', 'facts'] },
    { from: ['$input', 'facts'], to: ['facts', 'input'] },
  ],
  outputs: { findings: ['collect', 'output'], evidence: ['facts', 'output'] },
});
function caller(node: FlowNode): Definition {
  return {
    schemaVersion: 1,
    inputs: nodeInputPorts(node),
    nodes: [node],
    edges: nodeInputPorts(node).map((p) => ({
      from: ['$input', p],
      to: [node.id, p],
    })),
    outputs: Object.fromEntries(
      nodeOutputPorts(node).map((p) => [p, [node.id, p]]),
    ),
  };
}
async function save(s: Awaited<ReturnType<typeof setup>>, def: Definition) {
  return s.flow.saveDraft(
    s.caller.id,
    (await s.files.read(s.caller.id)).draftId,
    def,
  );
}
function callNode(workId: string, definitionId: string, map = false): FlowNode {
  return {
    id: 'invoke',
    label: 'call method',
    kind: 'call',

    operation: map ? 'map' : 'aggregate',
    concurrency: 2,
    call: {
      workId,
      definitionId,
      inputNames: ['targets', 'facts'],
      outputNames: ['findings', 'evidence'],
      ...(map ? { eachPort: 'targets' } : {}),
    },
  };
}
const business: WorkItemInput = {
  id: 'item',
  key: 'I1',
  title: 'business',
  goal: 'investigate',
  revision: 1,
  data: {},
  materials: [
    { id: 'unrelated', text: 'do not broadcast' },
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `input-${i}`,
      text: `fixture ${i}`,
    })),
    { id: 'targets-0', text: 'one' },
    { id: 'targets-1', text: 'two' },
    { id: 'facts-0', text: 'facts' },
  ],
};

test('fixed call maps one port, broadcasts the other and preserves multiple named outputs and real child sources', async (t) => {
  const s = await setup(t),
    version = await s.flow.saveDraft(s.method.id, undefined, callee());
  const def = caller(callNode(s.method.id, version, true));
  assert.deepEqual(checkDefinition(def), []);
  const selectedInputs = inputs({ targets: [1, 2], facts: ['fixed'] });
  const selectedSources = Object.values(selectedInputs)
    .flat()
    .map((item, index) => {
      const source = {
        workId: 'source-work',
        runId: 'source-run',
        resultId: `source-${index}`,
        port: 'output',
        index: 0,
      };
      item.source = source;
      item.sourceResultIds = [source.resultId];
      return source;
    });
  const id = await s.runs.start(s.caller.id, {
    definitionId: await save(s, def),
    inputs: selectedInputs,
    inputSources: selectedSources,
    scope: 'full',
    workItem: business,
    effectMode: 'commit',
  });
  await s.runs.wait(id);
  const run = (await s.files.read(s.caller.id)).runs.find((r) => r.id === id)!;
  assert.equal(run.status, 'completed');
  assert.equal(run.results.length, 2);
  assert.deepEqual(
    run.results.flatMap((r) => r.outputs.findings.map((i) => i.value)),
    [
      { targets: [1], facts: ['fixed'] },
      { targets: [2], facts: ['fixed'] },
    ],
  );
  assert.deepEqual(
    run.results.flatMap((r) => r.outputs.evidence.map((i) => i.value)),
    ['fixed', 'fixed'],
  );
  const childRuns = (await s.files.read(s.method.id)).runs;
  assert.equal(childRuns.length, 2);
  for (const r of run.results) {
    const child = childRuns.find((c) => c.id === r.call?.runId)!;
    assert.equal(child.definitionId, version);
    assert.equal(child.parentCall?.runId, id);
    assert.equal(child.effectMode, 'commit');
    assert.equal(child.workItem?.id, 'item');
    assert.deepEqual(child.inputSources, [
      r.input.targets[0].source,
      r.input.facts[0].source,
    ]);
    assert.ok(!child.workItem!.materials.some((m) => m.id === 'unrelated'));
    const targetId = r.input.targets[0].materialIds[0];
    assert.deepEqual(
      child.workItem!.materials.map((m) => m.id),
      [targetId, 'facts-0'],
    );
    assert.ok(
      child.results.some(
        (c) => c.id === r.outputs.findings[0].source?.resultId,
      ),
    );
    assert.deepEqual(r.outputs.findings[0].sourceResultIds, [r.id]);
  }
  // A new adopted method does not change the call's frozen version.
  const next = callee();
  next.nodes[1].functionName = 'select-fields';
  next.nodes[1].params = { fields: ['new'] };
  await s.flow.saveDraft(s.method.id, version, next);
  assert.equal(childRuns[0].definitionId, version);
});

test('call rejects interface mismatch, missing version and indirect recursion before root run is saved', async (t) => {
  const s = await setup(t),
    version = await s.flow.saveDraft(s.method.id, undefined, callee());
  const node = callNode(s.method.id, version);
  node.call!.outputNames = ['wrong'];
  const def = caller(node);
  const id = await save(s, def);
  await assert.rejects(
    s.runs.start(s.caller.id, {
      definitionId: id,
      scope: 'full',
      inputs: inputs({ targets: [], facts: [] }),
    }),
    /端口|接口/,
  );
  assert.equal((await s.files.read(s.caller.id)).runs.length, 0);
  node.call!.definitionId = 'missing';
  node.call!.outputNames = ['findings', 'evidence'];
  await assert.rejects(
    s.runs.start(s.caller.id, {
      definitionId: await save(s, caller(node)),
      scope: 'full',
      inputs: inputs({ targets: [], facts: [] }),
    }),
    /定义|不存在|ENOENT/,
  );
  // Simulate malformed on-disk immutable references using a FileStore boundary, not user data.
  const cyclic: Definition = caller(callNode(s.method.id, version));
  const wrapped = { ...s.files, readDefinition: async () => cyclic };
  const runs = createRuns(wrapped, async () => null);
  t.after(() => runs.close());
  await assert.rejects(
    runs.start(s.caller.id, {
      definitionId: 'root',
      scope: 'full',
      inputs: inputs({ targets: [], facts: [] }),
    }),
    /递归|循环/,
  );
});

test('groupBy uses typed composite keys, stable group order and exact participating material lineage', async (t) => {
  const s = await setup(t);
  const node: FlowNode = {
    id: 'group',
    label: 'group repositories',
    kind: 'function',
    functionName: 'groupBy',

    operation: 'aggregate',
    groupBy: { keys: [['repo'], ['baseline']] },
  };
  const values = [
    { repo: 'a', baseline: 1, value: 'first' },
    { repo: 'b', baseline: 2, value: 'other' },
    { repo: 'a', baseline: 1, value: 'second' },
    { repo: 'a', baseline: '1', value: 'typed' },
  ];
  const id = await s.runs.start(s.caller.id, {
    definitionId: await save(s, caller(node)),
    inputs: inputs({ input: values }),
    scope: 'full',
  });
  await s.runs.wait(id);
  const run = (await s.files.read(s.caller.id)).runs.find((r) => r.id === id)!;
  assert.equal(run.status, 'completed');
  const result = run.results[0].outputs.output;
  assert.deepEqual(
    result.map((i) => i.value),
    [
      { key: ['a', 1], items: [values[0], values[2]] },
      { key: ['b', 2], items: [values[1]] },
      { key: ['a', '1'], items: [values[3]] },
    ],
  );
  assert.deepEqual(result[0].materialIds, ['input-0', 'input-2']);
  const invalid = await s.runs.start(s.caller.id, {
    definitionId: (await s.files.read(s.caller.id)).draftId!,
    scope: 'full',
    inputs: inputs({ input: [{ repo: 'a' }] }),
  });
  await s.runs.wait(invalid);
  assert.equal((await s.files.read(s.caller.id)).runs.at(-1)!.status, 'failed');
});

function singleCall(
  workId: string,
  definitionId: string,
  map = false,
): FlowNode {
  return {
    id: 'invoke',
    label: 'method',
    kind: 'call',

    operation: map ? 'map' : 'aggregate',
    concurrency: 2,
    call: {
      workId,
      definitionId,
      inputNames: ['input'],
      outputNames: ['result'],
      ...(map ? { eachPort: 'input' } : {}),
    },
  };
}
function oneMethod(node: FlowNode): Definition {
  return {
    schemaVersion: 1,
    inputs: ['input'],
    nodes: [node],
    edges: [{ from: ['$input', 'input'], to: [node.id, 'input'] }],
    outputs: { result: [node.id, 'output'] },
  };
}

test('mapped call preserves successful children, real failure and blocks dependent aggregate', async (t) => {
  const seen: number[] = [];
  const s = await setup(t, async (ctx) => {
    const v = ctx.inputs.input[0].value as number;
    seen.push(v);
    if (v === 2) throw Error('investigation unavailable');
    return v * 10;
  });
  const method = oneMethod({
    id: 'check',
    label: 'investigate',
    kind: 'agent',

    operation: 'map',
    task: 'fixture boundary',
  });
  const version = await s.flow.saveDraft(s.method.id, undefined, method),
    def = caller(singleCall(s.method.id, version, true));
  def.nodes.push({
    id: 'after',
    label: 'aggregate',
    kind: 'function',

    operation: 'aggregate',
    functionName: 'identity',
  });
  def.edges.push({ from: ['invoke', 'result'], to: ['after', 'input'] });
  def.outputs = { result: ['after', 'output'] };
  const id = await s.runs.start(s.caller.id, {
    definitionId: await save(s, def),
    scope: 'full',
    inputs: inputs({ input: [1, 2, 3] }),
  });
  await s.runs.wait(id);
  const run = (await s.files.read(s.caller.id)).runs.find((r) => r.id === id)!;
  assert.equal(run.status, 'failed');
  assert.equal(run.nodeStates.after, 'blocked');
  assert.deepEqual(seen.sort(), [1, 2, 3]);
  assert.equal(run.results.filter((r) => r.status === 'completed').length, 2);
  assert.match(
    run.results.find((r) => r.status === 'failed')!.error!,
    /investigation unavailable/,
  );
  assert.equal((await s.files.read(s.method.id)).runs.length, 3);
});

test('call input contract failure is explicit, zero mapped input creates zero child runs, preview stays preview', async (t) => {
  const effects: string[] = [];
  const s = await setup(t, async (ctx) => {
    effects.push(ctx.effectMode!);
    return ctx.inputs.input[0].value;
  });
  const method = oneMethod({
    id: 'check',
    label: 'check',
    kind: 'agent',

    operation: 'map',
    task: 'fixture boundary',
  });
  method.inputContracts = {
    input: { item: { type: 'number' }, required: true },
  };
  const version = await s.flow.saveDraft(s.method.id, undefined, method),
    def = caller(singleCall(s.method.id, version, true)),
    definitionId = await save(s, def);
  const empty = await s.runs.start(s.caller.id, {
    definitionId,
    scope: 'full',
    inputs: inputs({ input: [] }),
  });
  await s.runs.wait(empty);
  assert.equal(
    (await s.files.read(s.caller.id)).runs.at(-1)!.status,
    'completed',
  );
  assert.equal((await s.files.read(s.method.id)).runs.length, 0);
  const invalid = await s.runs.start(s.caller.id, {
    definitionId,
    scope: 'full',
    inputs: inputs({ input: ['wrong'] }),
  });
  await s.runs.wait(invalid);
  assert.match(
    (await s.files.read(s.caller.id)).runs.at(-1)!.results[0].error!,
    /schema/,
  );
  assert.equal((await s.files.read(s.method.id)).runs.length, 0);
  const preview = await s.runs.start(s.caller.id, {
    definitionId,
    scope: 'full',
    inputs: inputs({ input: [1] }),
    workItem: business,
    effectMode: 'commit',
    comparisonId: 'comparison',
  });
  await s.runs.wait(preview);
  assert.deepEqual(effects, ['preview']);
  assert.equal(
    (await s.files.read(s.method.id)).runs.at(-1)!.effectMode,
    'preview',
  );
});

test('stop propagates through real call children and late responses do not publish outputs or launch remaining work', async (t) => {
  const contexts: NodeExecution[] = [];
  const releases: (() => void)[] = [];
  let allStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    allStarted = resolve;
  });
  const s = await setup(t, async (ctx) => {
    contexts.push(ctx);
    if (contexts.length === 2) allStarted();
    await new Promise<void>((resolve) => releases.push(resolve));
    return 'late';
  });
  const version = await s.flow.saveDraft(
    s.method.id,
    undefined,
    oneMethod({
      id: 'check',
      label: 'check',
      kind: 'agent',

      operation: 'map',
      task: 'fixture boundary',
    }),
  );
  const id = await s.runs.start(s.caller.id, {
    definitionId: await save(s, caller(singleCall(s.method.id, version, true))),
    scope: 'full',
    inputs: inputs({ input: [1, 2, 3] }),
  });
  await started;
  await s.runs.stop(s.caller.id, id);
  assert.ok(contexts.every((ctx) => ctx.signal.aborted));
  releases.forEach((resolve) => resolve());
  await s.runs.wait(id);
  const run = (await s.files.read(s.caller.id)).runs.find((r) => r.id === id)!;
  assert.equal(run.status, 'cancelled');
  assert.equal(run.results.length, 2);
  assert.ok(
    run.results.every(
      (r) => r.status === 'cancelled' && !Object.keys(r.outputs).length,
    ),
  );
  assert.ok(
    (await s.files.read(s.method.id)).runs.every(
      (r) => r.status === 'cancelled',
    ),
  );
});

test('nested wait is visible at caller, survives file reopen, resumes same children and keeps completed steps', async (t) => {
  const counts = new Map<string, number>();
  const execute = async (ctx: NodeExecution) => {
    counts.set(ctx.node.id, (counts.get(ctx.node.id) ?? 0) + 1);
    return ctx.inputs.input[0].value;
  };
  const s = await setup(t, execute);
  const method: Definition = {
    schemaVersion: 1,
    inputs: ['input'],
    nodes: [
      {
        id: 'before',
        label: 'before wait',
        kind: 'agent',

        operation: 'map',
        task: 'fixture boundary',
      },
      {
        id: 'wait',
        label: 'wait',
        kind: 'wait',

        operation: 'aggregate',
        wait: { event: 'supplement', reason: 'need explicit evidence' },
      },
      {
        id: 'after',
        label: 'after wait',
        kind: 'agent',

        operation: 'map',
        task: 'fixture boundary',
      },
    ],
    edges: [
      { from: ['$input', 'input'], to: ['before', 'input'] },
      { from: ['before', 'output'], to: ['wait', 'input'] },
      { from: ['wait', 'output'], to: ['after', 'input'] },
    ],
    outputs: { result: ['after', 'output'] },
  };
  const version = await s.flow.saveDraft(s.method.id, undefined, method);
  const id = await s.runs.start(s.caller.id, {
    definitionId: await save(s, caller(singleCall(s.method.id, version))),
    scope: 'full',
    inputs: inputs({ input: ['original'] }),
    workItem: business,
    effectMode: 'commit',
  });
  await s.runs.wait(id);
  let parent = (await s.files.read(s.caller.id)).runs.find((r) => r.id === id)!;
  assert.equal(parent.status, 'waiting');
  assert.equal(parent.results[0].status, 'waiting');
  const ref = parent.results[0].call!;
  assert.equal(
    (await s.files.read(ref.workId)).runs.find((r) => r.id === ref.runId)!
      .waits![0].event,
    'supplement',
  );
  s.runs.close();
  const reopened = createFiles(s.root);
  await reopened.onServerStart();
  const recovered = createRuns(reopened, execute);
  t.after(() => recovered.close());
  await recovered.recover();
  await recovered.wait(id);
  assert.equal(parent.waits?.[0].reason, 'need explicit evidence');
  await recovered.signal(s.caller.id, id, {
    id: 'evt',
    name: 'supplement',
    payload: { version: 2 },
  });
  await recovered.wait(ref.runId);
  await recovered.wait(id);
  parent = (await reopened.read(s.caller.id)).runs.find((r) => r.id === id)!;
  assert.equal(parent.status, 'completed');
  assert.equal(parent.results.length, 1);
  assert.equal(parent.results[0].call!.runId, ref.runId);
  assert.deepEqual(
    parent.results[0].outputs.result.map((i) => i.value),
    ['original'],
  );
  assert.equal(counts.get('before'), 1);
  assert.equal(counts.get('after'), 1);
  assert.equal((await reopened.read(s.method.id)).runs.length, 1);
});

test('explicit resume reuses interrupted nested call identity and completed child instances', async (t) => {
  const counts = new Map<string, number>();
  let uncertainStarted!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    uncertainStarted = resolve;
  });
  const firstExecute = async (ctx: NodeExecution) => {
    counts.set(ctx.node.id, (counts.get(ctx.node.id) ?? 0) + 1);
    if (ctx.node.id === 'uncertain') {
      uncertainStarted();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return ctx.inputs.input[0].value;
  };
  const s = await setup(t, firstExecute);
  const method: Definition = {
    schemaVersion: 1,
    inputs: ['input'],
    nodes: [
      {
        id: 'done',
        label: 'done',
        kind: 'agent',

        operation: 'map',
        task: 'fixture boundary',
      },
      {
        id: 'uncertain',
        label: 'uncertain',
        kind: 'agent',

        operation: 'map',
        task: 'fixture boundary',
      },
    ],
    edges: [
      { from: ['$input', 'input'], to: ['done', 'input'] },
      { from: ['done', 'output'], to: ['uncertain', 'input'] },
    ],
    outputs: { result: ['uncertain', 'output'] },
  };
  const version = await s.flow.saveDraft(s.method.id, undefined, method);
  const id = await s.runs.start(s.caller.id, {
    definitionId: await save(s, caller(singleCall(s.method.id, version))),
    scope: 'full',
    inputs: inputs({ input: ['fixed'] }),
    workItem: business,
    effectMode: 'commit',
  });
  await started;
  s.runs.close();
  const reopened = createFiles(s.root);
  await reopened.onServerStart();
  release();
  await s.runs.wait(id);
  const oldRef = (await reopened.read(s.caller.id)).runs.find(
    (r) => r.id === id,
  )!.results[0].call!;
  const recovered = createRuns(reopened, async (ctx) => {
    counts.set(ctx.node.id, (counts.get(ctx.node.id) ?? 0) + 1);
    return ctx.inputs.input[0].value;
  });
  t.after(() => recovered.close());
  await recovered.resume(s.caller.id, id);
  await recovered.wait(id);
  const run = (await reopened.read(s.caller.id)).runs.find((r) => r.id === id)!;
  assert.equal(run.status, 'completed');
  assert.equal(run.results.length, 1);
  assert.equal(run.results[0].call!.runId, oldRef.runId);
  assert.equal(counts.get('done'), 1);
  assert.equal(counts.get('uncertain'), 2);
  assert.equal((await reopened.read(s.method.id)).runs.length, 1);
});

test('missing mapped material fails explicitly rather than leaking callee sample material', async (t) => {
  const s = await setup(t);
  const version = await s.flow.saveDraft(s.method.id, undefined, callee());
  const supplied = inputs({ targets: [1], facts: ['fixed'] });
  supplied.targets[0].materialIds = ['missing'];
  const id = await s.runs.start(s.caller.id, {
    definitionId: await save(s, caller(callNode(s.method.id, version, true))),
    scope: 'full',
    inputs: supplied,
    workItem: business,
    effectMode: 'commit',
  });
  await s.runs.wait(id);
  const run = (await s.files.read(s.caller.id)).runs.find((r) => r.id === id)!;
  assert.equal(run.status, 'failed');
  assert.match(run.results[0].error!, /missing.*冻结范围/);
  assert.equal((await s.files.read(s.method.id)).runs.length, 0);
});

test('two-level calls use one execution mechanism and preserve each fixed interface', async (t) => {
  const s = await setup(t, async (ctx) => ({
    observed: ctx.inputs.input[0].value,
    materialIds: ctx.materials.map((m) => m.id),
  }));
  const leaf = await s.work.createWork('leaf', []);
  const leafVersion = await s.flow.saveDraft(
    leaf.id,
    undefined,
    oneMethod({
      id: 'leaf',
      label: 'leaf',
      kind: 'agent',

      operation: 'map',
      task: 'fixture boundary',
    }),
  );
  const nested = caller(singleCall(leaf.id, leafVersion, true));
  const methodVersion = await s.flow.saveDraft(s.method.id, undefined, nested);
  const id = await s.runs.start(s.caller.id, {
    definitionId: await save(
      s,
      caller(singleCall(s.method.id, methodVersion, true)),
    ),
    scope: 'full',
    inputs: inputs({ input: ['a', 'b'] }),
    workItem: business,
    effectMode: 'commit',
  });
  await s.runs.wait(id);
  const parent = (await s.files.read(s.caller.id)).runs.find(
    (r) => r.id === id,
  )!;
  assert.equal(parent.status, 'completed');
  assert.deepEqual(
    parent.results.map((r) => r.outputs.result[0].value),
    [
      { observed: 'a', materialIds: ['input-0'] },
      { observed: 'b', materialIds: ['input-1'] },
    ],
  );
  const nestedRuns = (await s.files.read(s.method.id)).runs,
    leaves = (await s.files.read(leaf.id)).runs;
  assert.equal(nestedRuns.length, 2);
  assert.equal(leaves.length, 2);
  for (const child of leaves) {
    assert.ok(nestedRuns.some((r) => r.id === child.parentCall?.runId));
    assert.equal(child.effectMode, 'commit');
  }
});

test('malformed call and grouping drafts report issues without crashing validation', () => {
  const node = singleCall('method', 'version');
  node.call = { ...node.call!, inputNames: 12 as unknown as string[] };
  assert.ok(
    checkDefinition(
      caller({ ...node, call: { ...node.call!, inputNames: ['input'] } }),
    ).length === 0,
  );
  const def: Definition = {
    schemaVersion: 1,
    inputs: ['input'],
    nodes: [node],
    edges: [{ from: ['$input', 'input'], to: ['invoke', 'input'] }],
    outputs: { output: ['invoke', 'result'] },
  };
  assert.ok(checkDefinition(def).some((i) => i.field === 'call'));
  const group: FlowNode = {
    id: 'group',
    label: 'group',
    kind: 'function',

    operation: 'aggregate',
    functionName: 'groupBy',
    groupBy: { keys: [] },
  };
  assert.ok(
    checkDefinition(caller(group)).some((i) => i.field?.startsWith('groupBy')),
  );
});

test('stopping a waiting child wakes its caller with the actual cancellation', async (t) => {
  const s = await setup(t);
  const version = await s.flow.saveDraft(
    s.method.id,
    undefined,
    oneMethod({
      id: 'wait',
      label: 'wait',
      kind: 'wait',

      operation: 'aggregate',
      wait: { event: 'reply', reason: 'need reply' },
    }),
  );
  const id = await s.runs.start(s.caller.id, {
    definitionId: await save(s, caller(singleCall(s.method.id, version))),
    scope: 'full',
    inputs: inputs({ input: [1] }),
    workItem: business,
    effectMode: 'commit',
  });
  await s.runs.wait(id);
  const ref = (await s.files.read(s.caller.id)).runs.find((r) => r.id === id)!
    .results[0].call!;
  await s.runs.stop(ref.workId, ref.runId);
  await s.runs.wait(id);
  const parent = (await s.files.read(s.caller.id)).runs.find(
    (r) => r.id === id,
  )!;
  assert.equal(parent.status, 'failed');
  assert.match(parent.results[0].error!, /取消/);
});
