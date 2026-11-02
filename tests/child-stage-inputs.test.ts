import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/index.ts';
import type {
  Definition,
  ItemInputSelection,
  Run,
  ChildStageValue,
  WorkItemView,
} from '../src/shared/records.ts';
const identity: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  nodes: [
    {
      id: 'copy',
      label: '保留阶段原值',
      kind: 'function',
      functionName: 'identity',
      operation: 'map',
    },
  ],
  edges: [{ from: ['$input', 'input'], to: ['copy', 'input'] }],
  outputs: { records: ['copy', 'output'] },
};
const aggregate: Definition = {
  schemaVersion: 1,
  inputs: ['input'],
  nodes: [
    {
      id: 'collect',
      label: '收集所选阶段',
      kind: 'function',
      functionName: 'identity',
      operation: 'aggregate',
    },
  ],
  edges: [{ from: ['$input', 'input'], to: ['collect', 'input'] }],
  outputs: { records: ['collect', 'output'] },
};

test('twenty open children hand explicit multi-round results to one parent and retain raw values, identity and fixed provenance', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'child-stages-unified-')),
    app = await createApplication({ dataRoot: root });
  t.after(async () => {
    app.runs.close();
    app.batches.close();
    await rm(root, { recursive: true, force: true });
  });
  const method = await app.work.createWork('逐项阶段处理', []),
    version = await app.flow.saveDraft(method.id, undefined, identity);
  const parent = await app.items.create({
    title: '整体范围',
    goal: '明确采用各项阶段成果',
    materials: [],
  });
  async function run(
    itemId: string,
    bindings: Record<string, ItemInputSelection[]>,
  ) {
    let item = await app.items.get(itemId);
    await app.composition.bindInputs(itemId, item.revision, bindings);
    item = await app.items.get(itemId);
    const view = await app.execution.runItem(itemId, {
      baseRevision: item.revision,
    });
    const ref = view.runs.at(-1)!;
    await app.runs.wait(ref.runId);
    const run = (await app.files.read(ref.workId)).runs.find(
      (r) => r.id === ref.runId,
    )!;
    assert.equal(run.status, 'completed', run.error ?? '');
    return run;
  }
  const children: WorkItemView[] = [];
  for (let n = 0; n < 20; n++) {
    const child = await app.items.create({
      parentId: parent.id,
      title: `事项${n}`,
      goal: '核查阶段',
      materials: [`repo-${n}-A`, `repo-${n}-B`],
      criteria: ['核对实际依据'],
    });
    await app.composition.useMethod(
      child.id,
      child.revision,
      method.id,
      version,
    );
    await run(child.id, {
      input: child.materials.map((m) => ({
        kind: 'material',
        materialId: m.id,
      })),
    });
    children.push(child);
  }
  const firstBefore = await app.items.get(children[0].id),
    oldRef = firstBefore.runs[0];
  await app.files.change(oldRef.workId, (w) => {
    w.runs.find((r) => r.id === oldRef.runId)!.status = 'cancelled';
  });
  const more = await app.items.addEvidence(children[0].id, ['repo-0-C']);
  await run(children[0].id, {
    input: [{ kind: 'material', materialId: more.materials.at(-1)!.id }],
  });
  const stages = await app.items.stageInputs(parent.id),
    selections: ItemInputSelection[] = children.map((child) => {
      const current = stages.children.find((c) => c.id === child.id)!;
      return {
        kind: 'child-results',
        itemId: child.id,
        sources: current.runs.flatMap((r) =>
          r.groups
            .filter((g) => g.final)
            .flatMap((g) => g.outputs.map((o) => o.source)),
        ),
      };
    });
  assert.equal(stages.children.length, 20);
  assert.equal(
    (await app.items.completionInputs(parent.id)).selections.length,
    0,
  );
  const preview = await app.items.stagePreview(
    parent.id,
    selections[0] as Extract<ItemInputSelection, { kind: 'child-results' }>,
  );
  assert.equal((preview.value as unknown as ChildStageValue).outputs.length, 3);
  let item = await app.items.get(parent.id);
  await app.composition.saveFlow(parent.id, item.revision, aggregate);
  const result = await run(parent.id, { input: selections });
  assert.equal(result.inputs.input.length, 20);
  assert.equal(result.inputSources!.length, 41);
  const batch = result.results[0].outputs.output[0]
    .value as unknown as ChildStageValue[];
  assert.equal(batch.length, 20);
  assert.equal(batch[0].item.id, children[0].id);
  assert.deepEqual(
    new Set(batch[0].outputs.map((o) => o.value)),
    new Set(['repo-0-A', 'repo-0-B', 'repo-0-C']),
  );
  assert.equal((await app.items.get(parent.id)).status, 'open');
  await assert.rejects(() => app.items.complete(parent.id), /子项/);
  const fixed = structuredClone(result);
  await app.items.addEvidence(children[0].id, ['later']);
  assert.deepEqual(
    (await app.files.read(parent.workId)).runs.find((r) => r.id === result.id),
    fixed,
  );
  const partial = await app.items.prepare(parent.id, {
    inputBindings: { input: selections.slice(0, 18) },
  });
  assert.deepEqual(partial.issues, []);
  assert.equal(partial.inputs!.input.length, 18);
  const next: Definition = {
    schemaVersion: 1,
    inputs: ['input'],
    nodes: [
      {
        id: 'next',
        label: '明确展开清单',
        kind: 'function',
        functionName: 'identity',
        operation: 'flatMap',
      },
    ],
    edges: [{ from: ['$input', 'input'], to: ['next', 'input'] }],
    outputs: { records: ['next', 'output'] },
  };
  item = await app.items.get(parent.id);
  const draftId = await app.files.select(item.workId, (w) => w.draftId);
  await app.composition.saveFlow(parent.id, item.revision, next, draftId);
  const chained = await run(parent.id, {
    input: [
      {
        kind: 'result',
        source: {
          workId: parent.workId,
          runId: result.id,
          resultId: result.results[0].id,
          port: 'output',
          index: 0,
        },
      },
    ],
  });
  assert.deepEqual(
    chained.results[0].outputs.output.map((o) => o.value),
    batch,
  );
  await app.items.scope(children[0].id, 'excluded', '当前明确不纳入');
  const rejected = await app.items.prepare(parent.id, {
    inputBindings: { input: selections },
  });
  assert.match(rejected.issues.join(), /范围内直属子项/);
  const wrong = { ...selections[1], itemId: children[2].id } as Extract<
    ItemInputSelection,
    { kind: 'child-results' }
  >;
  await assert.rejects(
    () => app.items.stagePreview(parent.id, wrong),
    /当前工作项历史|当前工作项|子项正式/,
  );
});
