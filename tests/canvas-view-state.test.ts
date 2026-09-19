import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index.js';
import { createFlow } from '../src/server/flow/index.js';
import { createWorkService } from '../src/server/work/index.js';
import type { Definition, ViewState } from '../src/shared/records.js';

async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'dynamic-canvas-view-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = createFiles(root);
  const flow = createFlow(files);
  const work = await createWorkService(files).createWork('整理多路结果', [
    '材料',
  ]);
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['input'],
    nodes: [
      {
        id: 'first',
        label: '结果',
        kind: 'function',
        mode: 'each',
        functionName: 'identity',
      },
    ],
    edges: [{ from: ['$input', 'input'], to: ['first', 'input'] }],
    outputs: { result: ['first', 'output'] },
  };
  const definitionId = await flow.saveDraft(work.id, undefined, definition);
  await files.change(work.id, (value) => {
    value.comparisons = [
      {
        id: 'comparison',
        baselineId: definitionId,
        candidateId: definitionId,
        nodeId: 'first',
        frozenInputs: {},
        status: 'completed',
        stopRequested: false,
        createdAt: '2026-09-20T00:00:00Z',
      },
    ];
  });
  return { root, files, flow, work, definition, definitionId };
}

const routedView = () => ({
  positions: { $input: { x: 0, y: 0 }, first: { x: 340, y: 20 } },
  viewport: { x: 12, y: 30, zoom: 0.75 },
  showPorts: false,
  routing: {
    signature: 'graph-geometry-positions',
    routes: {
      'edge-0': [
        { x: 220, y: 48 },
        { x: 280, y: 48 },
        { x: 280, y: 68 },
        { x: 340, y: 68 },
      ],
    },
  },
});

test('画布路由和端口偏好真实保存重开，定义版本与比较保持不变', async (t) => {
  const { root, files, flow, work, definition, definitionId } = await setup(t);
  const before = await files.read(work.id);
  const view = routedView();
  await flow.saveLayout(work.id, view);
  view.routing.routes['edge-0'][0].x = 999;
  const reopened = createFiles(root);
  const after = await reopened.read(work.id);
  assert.deepEqual(after.view, routedView());
  assert.deepEqual(after.definitionIds, before.definitionIds);
  assert.equal(after.draftId, before.draftId);
  assert.deepEqual(after.comparisons, before.comparisons);
  assert.deepEqual(
    await reopened.readDefinition(work.id, definitionId),
    definition,
  );
  await createFlow(reopened).saveLayout(work.id, {
    ...routedView(),
    showPorts: true,
  });
  assert.equal((await createFiles(root).read(work.id)).view.showPorts, true);
});

test('坏画布偏好和路由明确拒绝，磁盘布局与保存通知不受影响', async (t) => {
  const { root, files, flow, work } = await setup(t);
  await flow.saveLayout(work.id, routedView());
  let notifications = 0;
  files.onChange(() => {
    notifications++;
  });
  const path = join(root, work.id, 'work.json');
  const before = await readFile(path, 'utf8');
  const invalid: unknown[] = [
    null,
    { ...routedView(), showPorts: 'yes' },
    { ...routedView(), showPorts: null },
    { ...routedView(), routing: null },
    { ...routedView(), routing: [] },
    { ...routedView(), routing: { signature: 12, routes: {} } },
    { ...routedView(), routing: { signature: '', routes: {} } },
    { ...routedView(), routing: { signature: 'graph', routes: null } },
    { ...routedView(), routing: { signature: 'graph', routes: [] } },
    ...[
      null,
      [],
      [{ x: 1, y: 2 }],
      [{ x: 1, y: 2 }, null],
      [
        { x: NaN, y: 2 },
        { x: 3, y: 4 },
      ],
      [
        { x: 1, y: Infinity },
        { x: 3, y: 4 },
      ],
      [
        { x: '1', y: 2 },
        { x: 3, y: 4 },
      ],
    ].map((route) => ({
      ...routedView(),
      routing: { signature: 'graph', routes: { 'edge-0': route } },
    })),
  ];
  for (const candidate of invalid) {
    await assert.rejects(
      flow.saveLayout(work.id, candidate as ViewState),
      /画布|路由|端口/,
    );
    assert.equal(await readFile(path, 'utf8'), before);
  }
  assert.equal(notifications, 0);
});

test('旧画布位置和视口仍可保存，无连接的空路由也有效', async (t) => {
  const { root, flow, work } = await setup(t);
  const legacy: ViewState = {
    positions: { first: { x: 45, y: -20 } },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  await flow.saveLayout(work.id, legacy);
  assert.deepEqual((await createFiles(root).read(work.id)).view, legacy);
  const empty = {
    positions: {},
    showPorts: false,
    routing: { signature: 'empty-graph', routes: {} },
  };
  await flow.saveLayout(work.id, empty);
  assert.deepEqual((await createFiles(root).read(work.id)).view, empty);
});
