import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv from 'ajv';
import { createFiles } from '../src/server/files/index.ts';
import { createWorkService } from '../src/server/work/index.ts';
import { createFlow, checkDefinition } from '../src/server/flow/index.ts';
import { schemaIssue, validateValue } from '../src/server/flow/schema.ts';
import { createAssistant } from '../src/server/assistant/index.ts';
import { createRuns } from '../src/server/runs/index.ts';
import { seedCatalog } from './catalog-fixture.ts';
import type { Definition, Json } from '../src/shared/records.ts';

test('equal schema values reuse one compiler and transient schemas do not accumulate in Ajv', () => {
  const prototype = Object.getPrototypeOf(Ajv.prototype);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'compile')!;
  let calls = 0;
  let compiler: { _cache: Map<unknown, unknown> } | undefined;
  Object.defineProperty(prototype, 'compile', {
    ...descriptor,
    value: function (this: object, schema: object | boolean) {
      calls++;
      compiler = this as { _cache: Map<unknown, unknown> };
      return Reflect.apply(descriptor.value, this, [schema]);
    },
  });
  try {
    const schema = {
      type: 'string',
      minLength: 1,
      title: 'compile-lifetime-regression',
    };
    for (let i = 0; i < 20; i++) {
      assert.equal(schemaIssue(structuredClone(schema)), undefined);
      validateValue(structuredClone(schema), 'accepted', 'value');
    }
    assert.equal(
      calls,
      1,
      'unchanged persisted schema content must compile once',
    );
    for (let i = 0; i < 200; i++)
      assert.equal(schemaIssue({ ...schema, title: 'draft-' + i }), undefined);
    assert.ok(
      compiler!._cache.size < 10,
      'Ajv must not retain every temporary input object',
    );
  } finally {
    Object.defineProperty(prototype, 'compile', descriptor);
  }
});

test('ordinary business source/evidence fields obey their explicit output schema', async () => {
  const root = await mkdtemp(join(tmpdir(), 'explicit-output-'));
  const files = createFiles(root),
    flow = createFlow(files);
  const work = await createWorkService(files).createWork('external evidence', [
    'original material',
  ]);
  const paths = await seedCatalog(root, {
    baseUrl: 'http://fixture.invalid',
    model: 'fixture',
    apiKey: 'fixture',
  });
  const value = {
    sourceId: 'advisory-123',
    references: ['https://example.test/advisory'],
    evidence: 'external, synthesized evidence [M99]',
  };
  const assistant = createAssistant(files, flow, {
    ...paths,
    runSession: async () => JSON.stringify(value),
  });
  const material = work.materials[0];
  const context = {
    workId: work.id,
    runId: 'run',
    definitionId: 'definition',
    instanceId: 'agent:0',
    node: {
      id: 'agent',
      label: 'Investigate',
      kind: 'agent' as const,
      operation: 'map' as const,
      task: 'Collect external evidence',
      expectedOutput: {
        type: 'object',
        required: ['sourceId', 'references', 'evidence'],
      },
      tools: { builtin: [], mcp: [] },
    },
    inputs: {
      input: [
        {
          sampleId: 's',
          value: 'target',
          materialIds: [material.id],
          sourceResultIds: [],
        },
      ],
    },
    materials: work.materials,
    signal: new AbortController().signal,
    onActivity: async () => {},
  };
  try {
    assert.deepEqual(await assistant.executeNode(context), value);
    await assert.rejects(
      assistant.executeNode({
        ...context,
        inputs: {
          input: [{ ...context.inputs.input[0], materialIds: ['missing'] }],
        },
      }),
      /原始材料不完整/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('all Agent instances use frozen material context without reading the entire Work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-projection-'));
  const files = createFiles(root),
    flow = createFlow(files);
  const work = await createWorkService(files).createWork('frozen input', [
    'one',
    'two',
    'three',
    'four',
    'five',
  ]);
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['rows'],
    nodes: [
      {
        id: 'a',
        label: 'work',
        kind: 'agent',
        operation: 'map',
        task: 'process',
      },
    ],
    edges: [{ from: ['$input', 'rows'], to: ['a', 'input'] }],
    outputs: { result: ['a', 'output'] },
  };
  const version = await flow.saveDraft(work.id, undefined, definition);
  const seen: Json[] = [];
  const runs = createRuns(files, async (context) => {
    seen.push(context.inputs.input[0].value);
    return context.inputs.input[0].value;
  });
  let reads = 0;
  const read = files.read;
  files.read = async (...args) => {
    reads++;
    return read(...args);
  };
  try {
    const id = await runs.start(work.id, {
      definitionId: version,
      scope: 'full',
      inputs: {
        rows: work.materials.map((material) => ({
          sampleId: material.id,
          value: material.text,
          materialIds: [material.id],
          sourceResultIds: [],
        })),
      },
    });
    await runs.wait(id);
    const saved = await files.select(work.id, (current) =>
      current.runs.find((run) => run.id === id)!,
    );
    assert.equal(saved.status, 'completed');
    assert.equal(seen.length, 5);
    assert.equal(
      reads,
      1,
      'only the initial persisted run append may copy the full Work; instances use frozen context',
    );
    assert.deepEqual(saved.materials, work.materials);
    await files.change(work.id, (current) => {
      current.materials[0].text = 'later edit';
    });
    assert.equal(
      await files.select(
        work.id,
        (current) =>
          current.runs.find((run) => run.id === id)!.materials[0].text,
      ),
      'one',
    );
  } finally {
    runs.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a private step records a fixed source node without making it executable', () => {
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['input'],
    nodes: [
      {
        id: 'step',
        label: 'Step',
        kind: 'function',
        operation: 'map',
        functionName: 'identity',
      },
    ],
    edges: [{ from: ['$input', 'input'], to: ['step', 'input'] }],
    outputs: { output: ['step', 'output'] },
    sourceNode: {
      workId: 'source-work',
      definitionId: 'fixed-version',
      nodeId: 'original-step',
    },
  };
  assert.deepEqual(checkDefinition(definition), []);
  for (const sourceNode of [
    null,
    [],
    {},
    { workId: '', definitionId: 'fixed', nodeId: 'step' },
    { workId: 'work', definitionId: 1, nodeId: 'step' },
  ]) {
    const malformed = { ...definition, sourceNode } as unknown as Definition;
    assert.match(checkDefinition(malformed)[0]?.message ?? '', /sourceNode/);
  }
});
