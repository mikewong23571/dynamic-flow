import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDefinition, createFlow } from '../src/server/flow/index.ts';
import { createFiles } from '../src/server/files/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createTrials } from '../src/server/trials/index.ts';
import { createRuns } from '../src/server/runs/index.ts';
import type {
  Definition,
  FlowNode,
  Inputs,
  Json,
  NodeExecution,
} from '../src/shared/records.ts';
const collection = (
  functionName: FlowNode['functionName'],
  extra: Partial<FlowNode> = {},
): FlowNode => ({
  id: 'group',
  label: '汇合',
  kind: 'function',
  mode: 'all',
  functionName,
  ...extra,
});
const definition = (
  node: FlowNode,
  ports: string[],
  downstream?: FlowNode,
): Definition => ({
  schemaVersion: 1,
  inputs: ports,
  nodes: [node, ...(downstream ? [downstream] : [])],
  edges: [
    ...ports
      .map((port) => ({
        from: ['$input', port] as [string, string],
        to: [node.id, port] as [string, string],
      }))
      .reverse(),
    ...(downstream
      ? [
          {
            from: [node.id, 'output'] as [string, string],
            to: [downstream.id, 'input'] as [string, string],
          },
        ]
      : []),
  ],
  outputs: { result: [downstream?.id ?? node.id, 'output'] },
});
const input = (values: Record<string, Json[]>): Inputs =>
  Object.fromEntries(
    Object.entries(values).map(([port, list]) => [
      port,
      list.map((value, index) => ({
        value,
        sampleId: `${port}-${index}`,
        materialIds: [`${port}-${index}`],
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
  const root = await mkdtemp(join(tmpdir(), 'multi-input-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = createFiles(root),
    flow = createFlow(files),
    work = await createWorkService(files).createWork('多路集合', ['fixture']);
  const reopened = createFiles(root),
    runs = createRuns(reopened, execute);
  t.after(() => runs.close());
  let draftId: string | undefined;
  return {
    files: reopened,
    work,
    runs,
    async run(def: Definition, inputs: Inputs) {
      draftId = await flow.saveDraft(work.id, draftId, def);
      const id = await runs.start(work.id, {
        definitionId: draftId,
        scope: 'full',
        inputs,
      });
      await runs.wait(id);
      return (await reopened.read(work.id)).runs.find((r) => r.id === id)!;
    },
  };
}

test('configured merge and collect execute ordered named ports after file reopen, with fixed output cardinality', async (t) => {
  const s = await setup(t),
    ports = ['investigation', 'remediation', 'verification'];
  for (const name of ['merge', 'collect'] as const) {
    const run = await s.run(
      definition(collection(name, { inputNames: ports }), ports),
      input({ verification: [3], remediation: [], investigation: [1, 2] }),
    );
    assert.equal(run.status, 'completed');
    const out = run.results[0].outputs.output;
    assert.deepEqual(
      out.map((i) => i.value),
      name === 'merge'
        ? [1, 2, 3]
        : [{ investigation: [1, 2], remediation: [], verification: [3] }],
    );
    assert.deepEqual(
      out.map((i) => i.materialIds),
      name === 'merge'
        ? [['investigation-0'], ['investigation-1'], ['verification-0']]
        : [['investigation-0', 'investigation-1', 'verification-0']],
    );
  }
});
test('collection validation locates bad port and join options', () => {
  assert.deepEqual(
    checkDefinition(
      definition(collection('collect', { inputNames: ['a', 'b'] }), ['a', 'b']),
    ),
    [],
  );
  assert.ok(
    checkDefinition(
      definition(collection('collect', { inputNames: ['a', 'a'] }), ['a']),
    ).some((i) => i.field === 'inputNames'),
  );
  assert.ok(
    checkDefinition(
      definition(
        collection('join', {
          join: {
            type: 'inner',
            leftKey: ['id'],
            rightKey: ['id'],
            duplicates: 'all',
          },
        }),
        ['left', 'right'],
      ),
    ).length === 0,
  );
});

const joined = (extra: Partial<NonNullable<FlowNode['join']>> = {}): FlowNode =>
  collection('join', {
    join: {
      type: 'inner',
      leftKey: ['id'],
      rightKey: ['key'],
      duplicates: 'all',
      ...extra,
    },
  });
const follow: FlowNode = {
  id: 'after',
  label: '读取结果',
  kind: 'function',
  functionName: 'identity',
  mode: 'each',
};

test('join all four modes retain duplicates, strict key types and deterministic rows', async (t) => {
  const s = await setup(t),
    left: Json[] = [
      { id: 1, a: 'first' },
      { id: '1', a: 'typed' },
      { id: 1, a: 'second' },
      { id: 3 },
    ],
    right: Json[] = [
      { key: 1, b: 'first' },
      { key: 2 },
      { key: 1, b: 'second' },
      { key: true },
    ];
  const matched = [
    { left: left[0], right: right[0] },
    { left: left[0], right: right[2] },
    { left: left[2], right: right[0] },
    { left: left[2], right: right[2] },
  ];
  for (const type of ['inner', 'left', 'right', 'full'] as const) {
    const run = await s.run(
      definition(joined({ type }), ['left', 'right'], follow),
      input({ right, left }),
    );
    assert.equal(run.status, 'completed');
    const values = run.results
      .filter((r) => r.nodeId === 'after')
      .flatMap((r) => r.outputs.output)
      .map((i) => i.value);
    const expected =
      type === 'inner'
        ? matched
        : type === 'right'
          ? [
              ...matched,
              { left: null, right: right[1] },
              { left: null, right: right[3] },
            ]
          : [
              { left: left[0], right: right[0] },
              { left: left[0], right: right[2] },
              { left: left[1], right: null },
              { left: left[2], right: right[0] },
              { left: left[2], right: right[2] },
              { left: left[3], right: null },
              ...(type === 'full'
                ? [
                    { left: null, right: right[1] },
                    { left: null, right: right[3] },
                  ]
                : []),
            ];
    assert.deepEqual(values, expected);
    const group = run.results.find((r) => r.nodeId === 'group')!;
    assert.deepEqual(group.outputs.output[0].materialIds, [
      'left-0',
      'right-0',
    ]);
    assert.deepEqual(group.outputs.output[1].materialIds, [
      'left-0',
      'right-2',
    ]);
  }
});

test('join validates duplicate policy on both sides and rejects invalid keys with node errors', async (t) => {
  const s = await setup(t);
  for (const [left, right, config, pattern] of [
    [[{ id: 1 }, { id: 1 }], [], { duplicates: 'error' }, /重复键/],
    [[], [{ key: 1 }, { key: 1 }], { duplicates: 'error' }, /重复键/],
    [[{}], [], {}, /缺失/],
    [[{ id: null }], [], {}, /键必须/],
    [[{ id: { x: 1 } }], [], {}, /键必须/],
    [[{ id: [] }], [], {}, /键必须/],
    [[{}], [], { leftKey: ['toString'] }, /缺失/],
  ] as [Json[], Json[], Partial<NonNullable<FlowNode['join']>>, RegExp][]) {
    const run = await s.run(
      definition(joined(config), ['left', 'right'], follow),
      input({ left, right }),
    );
    assert.equal(run.status, 'failed');
    assert.equal(run.nodeStates.after, 'blocked');
    assert.match(run.results[0].error!, pattern);
    assert.deepEqual(run.results[0].outputs, {});
  }
  const scalar = await s.run(
    definition(joined({ leftKey: [], rightKey: [] }), ['left', 'right']),
    input({ left: [true, 1, '1'], right: [1, true, '1'] }),
  );
  assert.deepEqual(
    scalar.results[0].outputs.output.map((i) => i.value),
    [
      { left: true, right: true },
      { left: 1, right: 1 },
      { left: '1', right: '1' },
    ],
  );
  const nested = await s.run(
    definition(joined({ leftKey: ['keys', 0], rightKey: ['key', 'id'] }), [
      'left',
      'right',
    ]),
    input({ left: [{ keys: ['x'] }], right: [{ key: { id: 'x' } }] }),
  );
  assert.equal(nested.results[0].outputs.output.length, 1);
});

test('empty routes finish, collect keeps arrays and downstream expression destructures the named result', async (t) => {
  const s = await setup(t),
    ports = ['a', 'b'];
  for (const functionName of ['collect', 'merge', 'join'] as const) {
    const ps = functionName === 'join' ? ['left', 'right'] : ports;
    const node =
      functionName === 'join'
        ? joined({ type: 'full' })
        : collection(functionName, { inputNames: ps });
    const run = await s.run(
      definition(node, ps),
      input(Object.fromEntries(ps.map((p) => [p, []]))),
    );
    assert.equal(run.status, 'completed');
    assert.deepEqual(
      run.results[0].outputs.output.map((i) => i.value),
      functionName === 'collect' ? [{ a: [], b: [] }] : [],
    );
  }
  const after: FlowNode = {
    ...follow,
    functionName: 'expression',
    operation: 'map',
    expression: {
      kind: 'let',
      value: { kind: 'variable', name: 'input' },
      pattern: {
        kind: 'object',
        fields: { a: { kind: 'bind', name: 'list' } },
      },
      body: { kind: 'variable', name: 'list', path: [0] },
    },
  };
  const run = await s.run(
    definition(collection('collect', { inputNames: ports }), ports, after),
    input({ a: [{ answer: 42 }], b: [] }),
  );
  assert.deepEqual(
    run.results.find((r) => r.nodeId === 'after')!.outputs.output[0].value,
    { answer: 42 },
  );
});

test('collection schemas check named input and whole result, then block downstream on actual mismatch', async (t) => {
  const s = await setup(t),
    ps = ['a', 'b'];
  for (const extra of [
    {
      inputSchema: {
        type: 'object',
        properties: { a: { type: 'array', items: { type: 'number' } } },
      },
    },
    { expectedOutput: { type: 'array', items: { type: 'number' } } },
  ] as Partial<FlowNode>[]) {
    const run = await s.run(
      definition(collection('merge', { inputNames: ps, ...extra }), ps, follow),
      input({ a: ['bad'], b: [] }),
    );
    assert.equal(run.status, 'failed');
    assert.match(run.results[0].error!, /schema/);
    assert.equal(run.nodeStates.after, 'blocked');
  }
  const invalidOutput = await s.run(
    definition(
      {
        ...joined(),
        expectedOutput: {
          type: 'array',
          items: { type: 'object', properties: { left: { type: 'number' } } },
        },
      },
      ['left', 'right'],
      follow,
    ),
    input({ left: [{ id: 1 }], right: [{ key: 1 }] }),
  );
  assert.equal(invalidOutput.status, 'failed');
  assert.equal(invalidOutput.nodeStates.after, 'blocked');
  const collected = await s.run(
    definition(
      collection('collect', {
        inputNames: ps,
        inputSchema: {
          type: 'object',
          required: ps,
          properties: { a: { type: 'array' }, b: { type: 'array' } },
        },
        expectedOutput: { type: 'object', required: ps },
      }),
      ps,
    ),
    input({ a: [1], b: [] }),
  );
  assert.equal(collected.status, 'completed');
});

test('static connections compare collection port item schemas and emitted item cardinality', () => {
  const source: FlowNode = {
    id: 'source',
    label: '源',
    kind: 'function',
    functionName: 'identity',
    mode: 'each',
    expectedOutput: { type: 'string' },
  };
  const target = collection('collect', {
    inputNames: ['a', 'b'],
    inputSchema: {
      type: 'object',
      properties: { a: { type: 'array', items: { type: 'number' } } },
    },
  });
  const def = definition(target, ['a', 'b']);
  def.nodes.unshift(source);
  def.edges.push({ from: ['$input', 'a'], to: ['source', 'input'] });
  def.edges.find((e) => e.to[1] === 'a')!.from = ['source', 'output'];
  assert.ok(
    checkDefinition(def).some(
      (i) => i.edgeIndex !== undefined && /schema/.test(i.message),
    ),
  );
  const merged = definition(
    collection('merge', {
      inputNames: ['a', 'b'],
      expectedOutput: { type: 'array', items: { type: 'number' } },
    }),
    ['a', 'b'],
    { ...follow, inputSchema: { type: 'number' } },
  );
  assert.deepEqual(checkDefinition(merged), []);
  merged.nodes[1].inputSchema = { type: 'string' };
  assert.ok(checkDefinition(merged).some((i) => /schema/.test(i.message)));
  const collect = definition(
    collection('collect', {
      inputNames: ['a', 'b'],
      expectedOutput: { type: 'object' },
    }),
    ['a', 'b'],
    { ...follow, inputSchema: { type: 'object' } },
  );
  assert.deepEqual(checkDefinition(collect), []);
  for (const bad of [null, 12, 'a', {}, ['a', 2]])
    assert.ok(
      checkDefinition(
        definition(
          collection('merge', { inputNames: bad as unknown as string[] }),
          ['a', 'b'],
        ),
      ).length,
    );
  for (const patch of [
    { inputNames: ['a', 'a'] },
    { inputNames: ['a', ' '] },
    { mode: 'each' },
    { operation: 'map' },
  ])
    assert.ok(
      checkDefinition(
        definition(
          collection('collect', {
            inputNames: ['a', 'b'],
            ...patch,
          } as Partial<FlowNode>),
          ['a', 'b'],
        ),
      ).length,
    );
  for (const config of [
    null,
    {},
    { type: 'wrong', leftKey: [], rightKey: [], duplicates: 'all' },
    { type: 'inner', leftKey: [-1], rightKey: 'id', duplicates: 'wrong' },
  ])
    assert.ok(
      checkDefinition(
        definition(collection('join', { join: config as FlowNode['join'] }), [
          'left',
          'right',
        ]),
      ).length,
    );
});

test('upstream instances finish out of order; merge waits, preserves declared order and direct row lineage', async (t) => {
  const s = await setup(t, async (ctx) => {
    await new Promise((resolve) =>
      setTimeout(resolve, ctx.node.id === 'a' ? 20 : 1),
    );
    return ctx.inputs.input[0].value;
  });
  const ports = ['a', 'b', 'c'];
  const group = collection('merge', { inputNames: ports });
  const def: Definition = {
    schemaVersion: 1,
    inputs: ports,
    nodes: [
      ...ports.map((id) => ({
        id,
        label: id,
        kind: 'agent' as const,
        mode: 'each' as const,
        task: 'echo',
      })),
      group,
    ],
    edges: [
      ...ports.map((id) => ({
        from: ['$input', id] as [string, string],
        to: [id, 'input'] as [string, string],
      })),
      ...[...ports].reverse().map((id) => ({
        from: [id, 'output'] as [string, string],
        to: ['group', id] as [string, string],
      })),
    ],
    outputs: { result: ['group', 'output'] },
  };
  const run = await s.run(def, input({ a: [1, 2], b: [3], c: [4] }));
  const out = run.results.find((r) => r.nodeId === 'group')!;
  assert.equal(run.status, 'completed');
  assert.deepEqual(
    out.outputs.output.map((i) => i.value),
    [1, 2, 3, 4],
  );
  for (const item of out.outputs.output) {
    const source = run.results.find(
      (r) => r.nodeId !== 'group' && r.outputs.output[0]?.value === item.value,
    )!;
    assert.deepEqual(item.sourceResultIds, [out.id, source.id]);
    assert.deepEqual(item.materialIds, source.outputs.output[0].materialIds);
  }
  const failing = structuredClone(def);
  failing.nodes.find((n) => n.id === 'b')!.expectedOutput = {
    type: 'number',
    minimum: 10,
  };
  const failed = await s.run(failing, input({ a: [1], b: [3], c: [] }));
  assert.equal(failed.status, 'failed');
  assert.equal(failed.nodeStates.group, 'blocked');
  assert.ok(!failed.results.some((r) => r.nodeId === 'group'));
});

test('join lineage uses exactly participating upstream instances; node preview and retry keep named ports', async (t) => {
  const s = await setup(t);
  const group = joined({ type: 'full' }),
    ports = ['left', 'right'];
  const def = definition(group, ports, follow);
  for (const port of ports) {
    def.nodes.unshift({
      id: port,
      label: port,
      kind: 'function',
      functionName: 'identity',
      mode: 'each',
    });
    def.edges.find((e) => e.to[0] === 'group' && e.to[1] === port)!.from = [
      port,
      'output',
    ];
    def.edges.push({ from: ['$input', port], to: [port, 'input'] });
  }
  const run = await s.run(
    def,
    input({ left: [{ id: 1 }, { id: 2 }], right: [{ key: 1 }, { key: 3 }] }),
  );
  assert.equal(run.status, 'completed');
  const result = run.results.find((r) => r.nodeId === 'group')!;
  assert.deepEqual(
    result.outputs.output.map((item) => item.materialIds),
    [['left-0', 'right-0'], ['left-1'], ['right-1']],
  );
  for (const item of result.outputs.output) {
    const expected = run.results
      .filter((r) => r.nodeId === 'left' || r.nodeId === 'right')
      .filter((r) =>
        item.materialIds.includes(r.outputs.output[0].materialIds[0]),
      )
      .map((r) => r.id);
    assert.deepEqual(
      new Set(item.sourceResultIds),
      new Set([result.id, ...expected]),
    );
  }
  const previewId = await s.runs.start(s.work.id, {
    definitionId: run.definitionId,
    scope: { nodeId: 'group' },
    inputs: input({ left: [{ id: 1 }], right: [{ key: 1 }] }),
  });
  await s.runs.wait(previewId);
  const preview = (await s.files.read(s.work.id)).runs.find(
    (r) => r.id === previewId,
  )!;
  assert.equal(preview.status, 'completed');
  assert.equal(preview.effectMode, 'preview');
  assert.deepEqual(Object.keys(preview.results[0].input), ports);
  const invalid = await s.run(def, input({ left: [{ id: null }], right: [] }));
  const failedResult = invalid.results.find((r) => r.nodeId === 'group')!;
  const retriedId = await s.runs.retry(s.work.id, invalid.id, [
    failedResult.id,
  ]);
  await s.runs.wait(retriedId);
  const retried = (await s.files.read(s.work.id)).runs.find(
    (r) => r.id === retriedId,
  )!;
  assert.equal(retried.effectMode, 'preview');
  assert.equal(retried.results[0].nodeId, 'group');
  assert.deepEqual(retried.results[0].input, failedResult.input);
  assert.match(retried.results[0].error!, /键必须/);
});

test('legacy merge retains per-input default and explicit aggregate array behavior', async (t) => {
  const s = await setup(t);
  for (const operation of [undefined, 'aggregate'] as const) {
    const run = await s.run(
      definition(collection('merge', { operation }), ['left', 'right']),
      input({ left: [1], right: [2] }),
    );
    assert.equal(run.status, 'completed');
    assert.deepEqual(
      run.results[0].outputs.output.map((i) => i.value),
      operation ? [[2, 1]] : [2, 1],
    );
  }
});

test('join comparison reuses identical named samples for baseline and candidate', async (t) => {
  const s = await setup(t),
    flow = createFlow(s.files),
    trials = createTrials(s.files, s.runs);
  const baseline = await s.run(
    definition(joined({ type: 'inner' }), ['left', 'right']),
    input({ left: [{ id: 1 }], right: [{ key: 2 }] }),
  );
  await flow.adopt(s.work.id, baseline.definitionId);
  const candidateId = await flow.saveDraft(
    s.work.id,
    baseline.definitionId,
    definition(joined({ type: 'full' }), ['left', 'right']),
  );
  const comparisonId = await trials.compare(s.work.id, {
    candidateId,
    nodeId: 'group',
    inputs: input({ left: [{ id: 1 }], right: [{ key: 2 }] }),
  });
  await trials.wait(comparisonId);
  const work = await s.files.read(s.work.id),
    compared = work.runs.slice(-2);
  assert.equal(work.comparisons[0].status, 'completed');
  assert.deepEqual(compared[0].inputs, compared[1].inputs);
  assert.deepEqual(
    compared.map((r) => r.effectMode),
    ['preview', 'preview'],
  );
  assert.deepEqual(
    compared.map((r) => r.results[0].outputs.output.length),
    [0, 2],
  );
});
