import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkExpression,
  evaluateExpression,
} from '../src/server/flow/expressions.ts';
import { checkDefinition, createFlow } from '../src/server/flow/index.ts';
import { createFiles } from '../src/server/files/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createRuns } from '../src/server/runs/index.ts';
import type { Expression, Pattern } from '../src/shared/expressions.ts';
import type { Definition, FlowNode, Json } from '../src/shared/records.ts';
const literal = (value: Json): Expression => ({ kind: 'literal', value });
const variable = (name: string, path?: (string | number)[]): Expression => ({
  kind: 'variable',
  name,
  path,
});
const bind = (name: string): Pattern => ({ kind: 'bind', name });
const call = (
  fn: 'add' | 'equal' | 'greaterThan' | 'divide' | 'subtract',
  ...args: Expression[]
): Expression => ({ kind: 'call', function: fn, args });
const pipeline: Expression = {
  kind: 'pipe',
  input: variable('input'),
  steps: [
    {
      kind: 'filter',
      input: variable('value'),
      binding: { kind: 'object', fields: { severity: bind('severity') } },
      predicate: call('equal', variable('severity'), literal('high')),
    },
    {
      kind: 'map',
      input: variable('value'),
      binding: { kind: 'object', fields: { score: bind('score') } },
      body: variable('score'),
    },
    {
      kind: 'reduce',
      input: variable('value'),
      initial: literal(0),
      accumulator: 'total',
      binding: bind('score'),
      body: call('add', variable('total'), variable('score')),
    },
  ],
};
test('pipe composes filter, destructuring map and seeded ordered reduce; empty semantics', () => {
  assert.deepEqual(checkExpression(pipeline), []);
  assert.equal(
    evaluateExpression(pipeline, [
      { severity: 'high', score: 3 },
      { severity: 'low', score: 1 },
      { severity: 'high', score: 4 },
    ]),
    7,
  );
  assert.equal(evaluateExpression(pipeline, []), 0);
  assert.equal(
    evaluateExpression(
      {
        kind: 'reduce',
        input: variable('input'),
        initial: literal(10),
        accumulator: 'a',
        binding: bind('x'),
        body: call('subtract', variable('a'), variable('x')),
      },
      [2, 3],
    ),
    5,
  );
  assert.deepEqual(
    evaluateExpression(
      { kind: 'pipe', input: variable('input'), steps: [] },
      { a: 1 },
    ),
    { a: 1 },
  );
  for (const kind of ['map', 'flatMap'] as const)
    assert.deepEqual(
      evaluateExpression(
        { kind, input: literal([]), binding: bind('x'), body: variable('x') },
        null,
      ),
      [],
    );
});
test('match is ordered, guards strict and otherwise explicit; object subset and rest', () => {
  const expr: Expression = {
    kind: 'match',
    value: variable('input'),
    cases: [
      {
        pattern: {
          kind: 'object',
          fields: {
            status: { kind: 'literal', value: 'affected' },
            score: bind('score'),
          },
          rest: 'rest',
        },
        when: call('greaterThan', variable('score'), literal(5)),
        then: variable('rest'),
      },
      {
        pattern: { kind: 'type', valueType: 'object', name: 'record' },
        then: variable('record', ['status']),
      },
    ],
    otherwise: literal('review'),
  };
  assert.deepEqual(
    evaluateExpression(expr, { status: 'affected', score: 8, product: 'A' }),
    { product: 'A' },
  );
  assert.equal(
    evaluateExpression(expr, { status: 'affected', score: 2 }),
    'affected',
  );
  assert.equal(evaluateExpression(expr, null), 'review');
  assert.throws(
    () =>
      evaluateExpression({ kind: 'match', value: literal(1), cases: [] }, null),
    /expression.*未匹配/,
  );
  assert.throws(
    () =>
      evaluateExpression(
        {
          kind: 'match',
          value: literal(1),
          cases: [{ pattern: bind('x'), when: literal(1), then: literal(2) }],
        },
        null,
      ),
    /布尔/,
  );
});
test('array exact/rest destructuring and lexical shadowing preserve inputs', () => {
  const input: Json = [1, 2, 3];
  const expr: Expression = {
    kind: 'let',
    value: variable('input'),
    pattern: { kind: 'array', items: [bind('input')], rest: 'tail' },
    body: { kind: 'array', items: [variable('input'), variable('tail')] },
  };
  const out = evaluateExpression(expr, input);
  assert.deepEqual(out, [1, [2, 3]]);
  assert.deepEqual(input, [1, 2, 3]);
  (out as Json[]).push(4);
  assert.deepEqual(input, [1, 2, 3]);
  assert.throws(
    () =>
      evaluateExpression(
        {
          ...expr,
          pattern: { kind: 'array', items: [bind('x')] },
          body: variable('x'),
        },
        input,
      ),
    /解构/,
  );
  assert.throws(
    () =>
      evaluateExpression(
        {
          kind: 'map',
          input: literal([1]),
          binding: { kind: 'object', fields: { x: bind('x') } },
          body: variable('x'),
        },
        null,
      ),
    /解构/,
  );
});
test('paths distinguish missing and null, own properties only; equality is structural', () => {
  assert.equal(evaluateExpression(variable('input', ['a']), { a: null }), null);
  for (const path of [['missing'], ['toString'], ['a', 0]])
    assert.throws(
      () => evaluateExpression(variable('input', path), { a: null }),
      /路径/,
    );
  assert.equal(
    evaluateExpression(
      call('equal', literal({ a: 1, b: [2] }), literal({ b: [2], a: 1 })),
      null,
    ),
    true,
  );
});
test('flatMap expands exactly once, pure calls enforce types and finite numbers', () => {
  assert.deepEqual(
    evaluateExpression(
      {
        kind: 'flatMap',
        input: literal([1, 2]),
        binding: bind('x'),
        body: {
          kind: 'array',
          items: [variable('x'), { kind: 'array', items: [variable('x')] }],
        },
      },
      null,
    ),
    [1, [1], 2, [2]],
  );
  assert.throws(
    () =>
      evaluateExpression(
        {
          kind: 'flatMap',
          input: literal([1]),
          binding: bind('x'),
          body: variable('x'),
        },
        null,
      ),
    /数组/,
  );
  assert.throws(
    () => evaluateExpression(call('add', literal('1'), literal(1)), null),
    /数字/,
  );
  assert.throws(
    () => evaluateExpression(call('divide', literal(1), literal(0)), null),
    /零/,
  );
  assert.throws(
    () =>
      evaluateExpression(
        call('add', literal(Number.MAX_VALUE), literal(Number.MAX_VALUE)),
        null,
      ),
    /有限/,
  );
  assert.throws(
    () =>
      evaluateExpression(
        {
          kind: 'filter',
          input: literal([1]),
          binding: bind('x'),
          predicate: literal(1),
        },
        null,
      ),
    /布尔/,
  );
});
test('validation locates malformed shapes, unknown references, duplicate bindings and scope leaks', () => {
  const invalid: unknown[] = [
    undefined,
    { kind: 'magic' },
    { kind: 'literal', value: Infinity },
    { kind: 'variable', name: 'missing' },
    {
      kind: 'map',
      input: literal([]),
      binding: { kind: 'array', items: [bind('x'), bind('x')] },
      body: variable('x'),
    },
    {
      kind: 'reduce',
      input: literal([]),
      initial: literal(0),
      accumulator: 'x',
      binding: bind('x'),
      body: variable('x'),
    },
    {
      kind: 'let',
      value: variable('x'),
      pattern: bind('x'),
      body: variable('x'),
    },
    { kind: 'call', function: 'add', args: [literal(1)] },
    { kind: 'variable', name: 'input', path: [-1] },
    { kind: 'object', fields: { x: variable('value') } },
  ];
  for (const expr of invalid) {
    const issues = checkExpression(expr);
    assert.ok(issues.length, JSON.stringify(expr));
    assert.ok(issues.every((i) => i.field.startsWith('expression')));
  }
  assert.deepEqual(
    checkExpression({
      kind: 'let',
      value: literal(2),
      pattern: bind('input'),
      body: variable('input'),
    }),
    [],
  );
});
const node = (
  expression: Expression,
  extra: Partial<FlowNode> = {},
): FlowNode => ({
  id: 'transform',
  label: '变换',
  kind: 'function',
  mode: 'all',
  operation: 'aggregate',
  functionName: 'expression',
  expression,
  ...extra,
});
const definition = (nodes: FlowNode[]): Definition => ({
  schemaVersion: 1,
  inputs: ['items'],
  nodes,
  edges: nodes.map((n, i) => ({
    from: i ? [nodes[i - 1].id, 'output'] : ['$input', 'items'],
    to: [n.id, 'input'],
  })),
  outputs: { result: [nodes.at(-1)!.id, 'output'] },
});
test('definition reports expression paths and requires explicit node operation', () => {
  const issues = checkDefinition(
    definition([node(variable('unknown'), { operation: undefined })]),
  );
  assert.ok(
    issues.some(
      (i) => i.nodeId === 'transform' && i.field === 'expression.name',
    ),
  );
  assert.ok(issues.some((i) => i.field === 'operation'));
});
test('saved and reopened definitions run pure expressions, preserve source order; schema blocks downstream', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'functional-ir-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = createFiles(root),
    flow = createFlow(files),
    work = await createWorkService(files).createWork('函数组合', ['a', 'b']);
  const inputs = {
    items: [
      { severity: 'high', score: 3 },
      { severity: 'low', score: 1 },
    ].map((value, i) => ({
      value,
      sampleId: `s${i}`,
      materialIds: [work.materials[i].id],
      sourceResultIds: [],
    })),
  };
  const id = await flow.saveDraft(
    work.id,
    undefined,
    definition([node(pipeline, { expectedOutput: { type: 'number' } })]),
  );
  const reopened = createFiles(root);
  let agentCalls = 0;
  const runs = createRuns(reopened, async () => {
    agentCalls++;
    return null;
  });
  t.after(() => runs.close());
  const runId = await runs.start(work.id, {
    definitionId: id,
    scope: 'full',
    inputs,
  });
  await runs.wait(runId);
  const run = (await reopened.read(work.id)).runs.find((r) => r.id === runId)!;
  assert.equal(run.status, 'completed');
  assert.equal(run.results[0].outputs.output[0].value, 3);
  assert.deepEqual(
    run.results[0].outputs.output[0].materialIds,
    work.materials.map((m) => m.id),
  );
  assert.equal(agentCalls, 0);
  const bad = await flow.saveDraft(
    work.id,
    id,
    definition([
      node(pipeline, { expectedOutput: { type: 'string' } }),
      { id: 'agent', label: '下游', kind: 'agent', mode: 'all', task: 'never' },
    ]),
  );
  const failedId = await runs.start(work.id, {
    definitionId: bad,
    scope: 'full',
    inputs,
  });
  await runs.wait(failedId);
  const failed = (await reopened.read(work.id)).runs.find(
    (r) => r.id === failedId,
  )!;
  assert.equal(failed.status, 'failed');
  assert.equal(agentCalls, 0);
  assert.deepEqual(failed.results[0].outputs, {});
});

test('remaining strict pure functions, Unicode names, nested patterns and scope isolation', () => {
  const evaluate = (
    fn: 'multiply' | 'lessThan' | 'and' | 'or' | 'not' | 'concat' | 'length',
    values: Json[],
  ) =>
    evaluateExpression(
      { kind: 'call', function: fn, args: values.map(literal) },
      null,
    );
  assert.equal(evaluate('multiply', [2, 3]), 6);
  assert.equal(evaluate('lessThan', [2, 3]), true);
  assert.equal(evaluate('and', [true, false]), false);
  assert.equal(evaluate('or', [false, true]), true);
  assert.equal(evaluate('not', [false]), true);
  assert.equal(evaluate('concat', ['a', 'b']), 'ab');
  assert.deepEqual(evaluate('concat', [[1], [2]]), [1, 2]);
  assert.equal(evaluate('length', ['abc']), 3);
  assert.equal(evaluate('length', [[1, 2]]), 2);
  for (const [fn, args] of [
    ['and', [false, 1]],
    ['or', [true, 1]],
    ['not', [null]],
    ['concat', ['x', []]],
    ['length', [{}]],
  ] as const)
    assert.throws(() => evaluate(fn, [...args] as Json[]));
  const expr: Expression = {
    kind: 'let',
    value: variable('input'),
    pattern: {
      kind: 'object',
      fields: {
        values: {
          kind: 'array',
          items: [{ kind: 'type', valueType: 'number', name: '首项' }],
          rest: '其余',
        },
      },
    },
    body: variable('首项'),
  };
  assert.equal(evaluateExpression(expr, { values: [4, 5] }), 4);
  assert.throws(() => evaluateExpression(expr, { values: ['4', 5] }), /解构/);
  assert.ok(
    checkExpression({
      kind: 'match',
      value: literal({ a: 1 }),
      cases: [
        {
          pattern: { kind: 'object', fields: { a: bind('leak') } },
          when: literal(false),
          then: variable('leak'),
        },
      ],
      otherwise: variable('leak'),
    }).some((i) => i.field === 'expression.otherwise.name'),
  );
  assert.deepEqual(
    evaluateExpression(
      {
        kind: 'filter',
        input: literal([]),
        binding: bind('x'),
        predicate: variable('x'),
      },
      null,
    ),
    [],
  );
});

test('node map preserves arrays; node flatMap expands once with ordered provenance; legacy remains unchanged', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'functional-modes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = createFiles(root),
    flow = createFlow(files),
    work = await createWorkService(files).createWork('组合语义', ['a', 'b']);
  const runs = createRuns(files, async () => {
    throw Error('pure flow must not call model');
  });
  t.after(() => runs.close());
  const inputs = {
    items: work.materials.map((m, i) => ({
      value: i + 1,
      sampleId: `s${i}`,
      materialIds: [m.id],
      sourceResultIds: [],
    })),
  };
  let draftId: string | undefined;
  async function run(n: FlowNode) {
    draftId = await flow.saveDraft(work.id, draftId, definition([n]));
    const id = await runs.start(work.id, {
      definitionId: draftId,
      scope: 'full',
      inputs,
    });
    await runs.wait(id);
    return (await files.read(work.id)).runs.find((r) => r.id === id)!;
  }
  const expression: Expression = {
    kind: 'array',
    items: [variable('input'), call('add', variable('input'), literal(10))],
  };
  const mapped = await run(
    node(expression, { mode: 'each', operation: 'map', concurrency: 2 }),
  );
  assert.deepEqual(
    mapped.results.flatMap((r) => r.outputs.output).map((i) => i.value),
    [
      [1, 11],
      [2, 12],
    ],
  );
  const expanded = await run(
    node(expression, { mode: 'each', operation: 'flatMap', concurrency: 2 }),
  );
  assert.deepEqual(
    expanded.results.flatMap((r) => r.outputs.output).map((i) => i.value),
    [1, 11, 2, 12],
  );
  assert.deepEqual(
    expanded.results.flatMap((r) => r.outputs.output).map((i) => i.materialIds),
    [
      [work.materials[0].id],
      [work.materials[0].id],
      [work.materials[1].id],
      [work.materials[1].id],
    ],
  );
  assert.ok(
    expanded.results.every((r) =>
      r.outputs.output.every((i) => i.sourceResultIds.includes(r.id)),
    ),
  );
  const legacy = await run({
    id: 'legacy',
    label: '旧函数',
    kind: 'function',
    mode: 'all',
    functionName: 'identity',
  });
  assert.deepEqual(
    legacy.results.flatMap((r) => r.outputs.output).map((i) => i.value),
    [1, 2],
  );
  const failed = await run(
    node(variable('input', ['missing']), { mode: 'each', operation: 'map' }),
  );
  assert.equal(failed.status, 'failed');
  assert.ok(
    failed.results.every(
      (r) => r.status === 'failed' && /路径/.test(r.error ?? ''),
    ),
  );
});

test('incomplete expression draft is editable, but cannot run; expression input schema is enforced', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'functional-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = createFiles(root),
    flow = createFlow(files),
    work = await createWorkService(files).createWork('草稿', ['a']);
  const runs = createRuns(files, async () => null);
  t.after(() => runs.close());
  const inputs = {
    items: [
      { value: 'text', sampleId: 's', materialIds: [], sourceResultIds: [] },
    ],
  };
  const invalid = await flow.saveDraft(
    work.id,
    undefined,
    definition([node(variable('unknown'))]),
  );
  assert.equal((await files.read(work.id)).draftId, invalid);
  await assert.rejects(
    runs.start(work.id, { definitionId: invalid, scope: 'full', inputs }),
    /变量|流程/,
  );
  const id = await flow.saveDraft(
    work.id,
    invalid,
    definition([
      node(variable('input'), {
        mode: 'each',
        operation: 'map',
        inputSchema: { type: 'number' },
      }),
    ]),
  );
  const runId = await runs.start(work.id, {
    definitionId: id,
    scope: 'full',
    inputs,
  });
  await runs.wait(runId);
  const run = (await files.read(work.id)).runs.find((r) => r.id === runId)!;
  assert.equal(run.status, 'failed');
  assert.match(run.results[0].error ?? '', /输入/);
  assert.deepEqual(run.results[0].outputs, {});
});
