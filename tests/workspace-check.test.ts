import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv from 'ajv';
import { createApplication } from '../src/server/index.ts';
import { seedCatalog } from './catalog-fixture.ts';
import type { Definition } from '../src/shared/records.ts';
import type { SessionInput } from '../src/server/assistant/pi.ts';

const definition: Definition = {
  schemaVersion: 1,
  inputs: ['records'],
  inputContracts: { records: { item: { type: 'object' } } },
  nodes: [
    {
      id: 'copy',
      label: '保留记录',
      kind: 'function',

      operation: 'map',
      functionName: 'identity',
      expectedOutput: { type: 'object' },
    },
  ],
  edges: [{ from: ['$input', 'records'], to: ['copy', 'input'] }],
  outputs: { rows: ['copy', 'output'] },
};
const source =
  'root = Workspace("记录", [records])\nrecords = Records("rows", "记录", "id", [Field("id", "编号"), Field("amount", "金额")])';

async function fixture(runSession?: (input: SessionInput) => Promise<string>) {
  const root = await mkdtemp(join(tmpdir(), 'workspace-check-'));
  await seedCatalog(root, {
    baseUrl: 'https://fixture.invalid',
    model: 'fixture',
    apiKey: 'fixture-secret',
  });
  const server = await createApplication({ dataRoot: root, runSession });
  const post = async (path: string, body: unknown) => {
    const response = await server.app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(
      response.status,
      path === '/api/items' ? 201 : 200,
      await response.clone().text(),
    );
    return response.json() as Promise<any>;
  };
  const item = await post('/api/items', {
    title: '整理报价',
    goal: '检查报价与缺口',
    materials: ['提供的报价记录'],
    criteria: ['报价依据可核对'],
  });
  const action = async (action: string, fields = {}) =>
    post(`/api/items/${item.id}/workspace/actions`, {
      action,
      baseRevision: (await server.items.get(item.id)).revision,
      ...fields,
    });
  await action('init');
  return {
    root,
    server,
    item,
    action,
    post,
    async close() {
      server.runs.close();
      server.batches.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('workspace check accepts incomplete drafts, locates real input shape errors and never saves', async () => {
  const f = await fixture();
  try {
    const malformed = await f.action('checkWorkspace', {
      definition: { schemaVersion: 1, inputs: ['records'], nodes: [] },
      source: 'root = Bad()',
    });
    assert.equal(malformed.canExecute, false);
    assert.equal(malformed.canPublish, false);
    assert.ok(malformed.issues.some((i: any) => i.area === 'flow'));
    assert.ok(malformed.issues.some((i: any) => i.area === 'ui'));
    assert.equal((await f.server.items.get(f.item.id)).revision, 0);
    const arrayInput = structuredClone(definition);
    arrayInput.inputContracts!.records.item = { type: 'array' };
    arrayInput.nodes[0].expectedOutput = { type: 'array' };
    await f.action('saveFlow', { definition: arrayInput });
    await f.action('addInput', {
      inputPort: 'records',
      label: '原始报价数组',
      value: [{ id: 'q1', amount: 20 }],
      materialIds: ['M01'],
    });
    const before = await f.server.items.get(f.item.id);
    const workBefore = await f.server.files.read(before.workId!);
    const checked = await f.action('checkWorkspace', { definition, source });
    assert.equal(checked.canExecute, false);
    const issue = checked.issues.find(
      (i: any) => i.code === 'INPUT_BINDING_INVALID',
    );
    assert.ok(issue);
    assert.equal(issue.path, 'inputBindings');
    assert.match(issue.message, /object|对象/);
    assert.deepEqual(await f.server.items.get(f.item.id), before);
    assert.deepEqual(await f.server.files.read(before.workId!), workBefore);
  } finally {
    await f.close();
  }
});

test('workspace check shares invocation units, separates execute from publish and validates fixed actual outputs', async () => {
  const f = await fixture();
  try {
    const wrongUnit = structuredClone(definition);
    wrongUnit.nodes[0].operation = 'aggregate';
    await f.action('saveFlow', { definition: wrongUnit });
    const added = await f.action('addInput', {
      inputPort: 'records',
      label: '报价',
      value: { id: 'q1', amount: 20 },
      materialIds: ['M01'],
    });
    let checked = await f.action('checkWorkspace');
    assert.equal(checked.canExecute, false);
    assert.ok(
      checked.issues.some(
        (i: any) =>
          i.code === 'NODE_OUTPUT_SCHEMA_MISMATCH' && i.path.includes('copy'),
      ),
    );
    await f.action('saveFlow', {
      definition,
      expectedDraftId: added.work.work.draftId,
    });
    await f.action('saveUiProgram', { source });
    const before = await f.server.items.get(f.item.id);
    checked = await f.action('checkWorkspace');
    assert.equal(checked.canExecute, true);
    assert.equal(checked.canPublish, false);
    assert.ok(
      checked.unchecked.some((i: any) => i.code === 'OUTPUTS_UNVERIFIED'),
    );
    assert.equal(checked.checked.itemRevision, before.revision);
    assert.equal(checked.checked.programId, before.uiProgram!.id);
    await f.action('run');
    let current;
    for (let n = 0; n < 100; n++) {
      current = await f.server.files.read(before.workId!);
      if (current.runs.at(-1)?.status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const runId = current!.runs.at(-1)!.id;
    assert.equal(current!.runs.at(-1)!.status, 'completed');
    checked = await f.action('checkWorkspace', { runId });
    assert.equal(checked.canPublish, true, JSON.stringify(checked));
    assert.equal(checked.publication.current, false);
    assert.deepEqual(checked.publication.missingOutputs, ['rows']);
    await f.action('publishDelivery', {
      runId,
      programId: before.uiProgram!.id,
      output: 'rows',
    });
    checked = await f.action('checkWorkspace', { runId });
    assert.equal(checked.publication.current, true);
    assert.equal((await f.server.items.get(f.item.id)).status, 'open');
    const broken = source.replace(
      'Field("amount", "金额")',
      'Field("missing", "不存在")',
    );
    checked = await f.action('checkWorkspace', { runId, source: broken });
    assert.equal(checked.canPublish, false);
    assert.ok(
      checked.issues.some(
        (i: any) => i.code === 'VIEW_DATA_INVALID' && i.area === 'ui',
      ),
    );
    assert.equal(
      (await f.server.items.get(f.item.id)).uiProgram!.id,
      before.uiProgram!.id,
    );
    const changed = structuredClone(definition);
    changed.nodes[0].label = '重新核对记录';
    await f.action('saveFlow', {
      definition: changed,
      expectedDraftId: current!.draftId,
    });
    checked = await f.action('checkWorkspace', { runId });
    assert.equal(checked.canPublish, false);
    assert.ok(
      checked.issues.some((i: any) => i.code === 'RUN_DEFINITION_MISMATCH'),
    );
  } finally {
    await f.close();
  }
});

test('Agent draft checks pass tool transport and repair through the real save path', async () => {
  let done = false;
  let failure: unknown;
  const f = await fixture(async (input) => {
    try {
      const tool = (name: string) => {
        const found = input.tools.find((t) => t.name === name);
        assert.ok(found, name);
        return found;
      };
      const call = async (name: string, args: unknown) =>
        JSON.parse(
          (
            (await tool(name).execute(
              'check-fixture',
              args as never,
              input.signal,
              undefined as never,
              undefined as never,
            )) as any
          ).content[0].text,
        );
      const ajv = new Ajv({ strict: false });
      for (const name of [
        'inspect_child_outputs',
        'preview_child_output',
        'select_child_outputs',
      ])
        assert.ok(tool(name));
      assert.equal(
        ajv.compile(tool('check_flow').parameters)({
          definition: { nodes: [] },
        }),
        true,
      );
      assert.equal(
        ajv.compile(tool('check_ui_program').parameters)({
          source: 'root = Bad()',
        }),
        true,
      );
      assert.equal(
        ajv.compile(tool('save_flow').parameters)({
          baseRevision: 1,
          definition: { nodes: [] },
        }),
        false,
      );
      assert.ok(
        (await call('check_flow', { definition: { nodes: [] } })).issues.length,
      );
      assert.ok(
        (await call('check_workspace', { source: 'root = Bad()' })).issues
          .length,
      );
      const initial = await call('inspect_work_item', {});
      const rejected = await call('check_workspace', {
        definition: { nodes: [] },
        source,
      });
      assert.equal(rejected.canExecute, false);
      await call('save_flow', {
        baseRevision: initial.item.revision,
        definition,
      });
      const result = await call('check_workspace', {});
      assert.ok(result.issues.some((i: any) => i.area === 'inputs'));
      assert.ok(result.unchecked.length);
      const state = await call('inspect_work_item', {});
      await call('save_ui_program', {
        baseRevision: state.item.revision,
        source,
      });
      await assert.rejects(
        call('publish_delivery', {
          baseRevision: state.item.revision + 1,
          runId: 'not-a-run',
          output: 'rows',
          programId: (await call('inspect_work_item', {})).uiProgram.id,
        }),
        /运行|DELIVERY|run/,
      );
      done = true;
      return '检查发现缺少实际输入，未启动执行。';
    } catch (error) {
      failure = error;
      throw error;
    }
  });
  try {
    await f.action('assistant', { text: '检查并修正方案，先不要运行' });
    for (let n = 0; n < 150 && !done && !failure; n++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    if (failure) throw failure;
    assert.ok(done);
    const item = await f.server.items.get(f.item.id);
    assert.equal((await f.server.files.read(item.workId!)).runs.length, 0);
  } finally {
    await f.close();
  }
});

test('child source tools discover, preview and bind exact stages without assuming completion', async () => {
  const f = await fixture();
  try {
    await f.action('saveFlow', { definition });
    const child = await f.post('/api/items', {
      title: '调查子项',
      goal: '保留调查原文',
      parentId: f.item.id,
      materials: ['子项实际材料'],
    });
    const method = await f.server.work.createWork('原文保留', []);
    const childDefinition = structuredClone(definition);
    delete childDefinition.inputContracts;
    delete childDefinition.nodes[0].expectedOutput;
    const version = await f.server.flow.saveDraft(
      method.id,
      undefined,
      childDefinition,
    );
    const prepared = await f.server.composition.useMethod(
      child.id,
      child.revision,
      method.id,
      version,
      undefined,
      { records: [{ kind: 'material', materialId: child.materials[0].id }] },
    );
    const launched = await f.server.execution.runItem(child.id, {
      baseRevision: prepared.item.revision,
    });
    await f.server.runs.wait(launched.runs.at(-1)!.runId);
    const discovered = await f.action('childOutputs', { limit: 1 });
    assert.equal(discovered.total, 1);
    assert.equal(discovered.outputs[0].itemId, child.id);
    const selection = {
      kind: 'child-results',
      itemId: child.id,
      sources: [discovered.outputs[0].source],
    };
    const preview = await f.action('previewChildOutput', { selection });
    assert.equal(preview.value.item.id, child.id);
    assert.equal(preview.value.outputs[0].value, '子项实际材料');
    await f.action('selectChildOutputs', {
      inputPort: 'records',
      selections: [selection],
    });
    const parent = await f.server.items.get(f.item.id);
    assert.deepEqual(parent.inputBindings!.records, [selection]);
    assert.equal((await f.server.items.get(child.id)).status, 'open');
    const checked = await f.action('checkWorkspace');
    assert.equal(checked.canExecute, true, JSON.stringify(checked));
    assert.equal(checked.inputs[0].count, 1);
    assert.deepEqual(checked.inputs[0].types, ['object']);
    const outsider = await f.post('/api/items', {
      title: '无关工作项',
      goal: '无关',
      materials: [],
    });
    const bad = await f.server.app.request(
      `/api/items/${f.item.id}/workspace/actions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'selectChildOutputs',
          baseRevision: parent.revision,
          inputPort: 'records',
          selections: [{ ...selection, itemId: outsider.id }],
        }),
      },
    );
    assert.equal(bad.status, 400);
    assert.deepEqual(await f.server.items.get(f.item.id), parent);
  } finally {
    await f.close();
  }
});

test('new input failures do not invalidate publication of an explicitly fixed successful run', async () => {
  const f = await fixture();
  try {
    const limited = structuredClone(definition);
    limited.nodes[0].operation = 'aggregate';
    limited.nodes[0].expectedOutput = {
      type: 'array',
      maxItems: 1,
      items: { type: 'object' },
    };
    await f.action('saveFlow', { definition: limited });
    await f.action('addInput', {
      inputPort: 'records',
      label: '报价一',
      value: { id: 'q1', amount: 20 },
      materialIds: ['M01'],
    });
    const planned = await f.action('saveUiProgram', { source });
    await f.action('run');
    let work;
    for (let n = 0; n < 100; n++) {
      work = await f.server.files.read(planned.work.work.id);
      if (work.runs.at(-1)?.status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const run = work!.runs.at(-1)!;
    assert.equal(run.status, 'completed');
    await f.action('addInput', {
      inputPort: 'records',
      label: '报价二',
      value: { id: 'q2', amount: 35 },
      materialIds: ['M01'],
    });
    const checked = await f.action('checkWorkspace', { runId: run.id });
    assert.equal(checked.canExecute, false);
    assert.ok(
      checked.issues.some(
        (issue: any) => issue.code === 'NODE_OUTPUT_SCHEMA_MISMATCH',
      ),
    );
    assert.equal(checked.canPublish, true, JSON.stringify(checked));
    assert.deepEqual((await f.server.files.read(work!.id)).runs.at(-1), run);
  } finally {
    await f.close();
  }
});

test('native form checks and saving use the same fixed input contract', async () => {
  const f = await fixture();
  try {
    await f.action('saveFlow', { definition });
    const before = await f.server.items.get(f.item.id);
    const invalid =
      'root = Workspace("输入", [form])\n$draft = {}\nform = InputForm("missing", "输入", $draft, save)\nsave = ActionButton("保存", @Run(submit))\nsubmit = Mutation("submit_input", {inputPort: "missing", value: $draft})';
    const checked = await f.action('checkWorkspace', { source: invalid });
    assert.ok(
      checked.issues.some(
        (issue: { code: string }) => issue.code === 'UI_CONTRACT_INVALID',
      ),
    );
    await assert.rejects(
      () =>
        f.server.composition.saveUiProgram(f.item.id, before.revision, {
          source: invalid,
        }),
      /入口/,
    );
    assert.deepEqual(await f.server.items.get(f.item.id), before);
  } finally {
    await f.close();
  }
});
