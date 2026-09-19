import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFiles } from '../src/server/files/index.js';
import {
  createFlow,
  checkDefinition,
  validateForRun,
} from '../src/server/flow/index.js';
import { createWorkService } from '../src/server/work/index.js';
import type { Definition, NodeResult, Run } from '../src/shared/records.js';

const definition = (): Definition => ({
  schemaVersion: 1,
  inputs: ['feedback'],
  nodes: [
    {
      id: 'classify',
      label: '分类',
      kind: 'agent',
      mode: 'each',
      task: '分类并引用材料编号',
    },
    {
      id: 'report',
      label: '报告',
      kind: 'agent',
      mode: 'all',
      task: '汇总有依据的建议',
    },
  ],
  edges: [
    { from: ['$input', 'feedback'], to: ['classify', 'input'] },
    { from: ['classify', 'output'], to: ['report', 'input'] },
  ],
  outputs: { report: ['report', 'output'] },
});
async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'dynamic-state-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = createFiles(root),
    flow = createFlow(files),
    service = createWorkService(files);
  const work = await service.createWork('整理客户反馈', [
    '界面顺手但导出失败',
    '希望批量导出',
    '搜索很好',
  ]);
  return { root, files, flow, service, work };
}
function result(
  id: string,
  materials: string[],
  status: NodeResult['status'] = 'completed',
): NodeResult {
  return {
    id,
    runId: 'run1',
    definitionId: 'd1',
    nodeId: 'classify',
    instanceId: id,
    input: { input: [] },
    outputs: {
      output: [
        {
          sampleId: materials.join('+'),
          value: { category: '问题' },
          materialIds: materials,
          sourceResultIds: [id],
        },
      ],
    },
    status,
    activities: [],
    startedAt: new Date().toISOString(),
  };
}
function run(results: NodeResult[]): Run {
  return {
    id: 'run1',
    definitionId: 'd1',
    scope: 'full',
    inputs: {},
    status: 'completed',
    stopRequested: false,
    nodeStates: { classify: 'completed' },
    results,
    startedAt: new Date().toISOString(),
  };
}

test('真实文件重开保留不可变定义、材料、布局且读返回隔离副本', async (t) => {
  const { root, files, flow, work } = await setup(t);
  const d = definition();
  const id = await flow.saveDraft(work.id, undefined, d);
  await flow.saveLayout(work.id, {
    positions: { classify: { x: 40, y: 70 } },
    viewport: { x: 1, y: 2, zoom: 0.8 },
  });
  const reopened = createFlow(createFiles(root));
  const snap = await reopened.snapshot(work.id);
  assert.deepEqual(snap.definitions[id], d);
  assert.equal(snap.work.materials.length, 3);
  assert.equal(snap.work.view.positions.classify.x, 40);
  snap.work.goal = '污染';
  snap.definitions[id].nodes[0].task = '污染';
  assert.equal((await files.read(work.id)).goal, work.goal);
  assert.equal(
    (await files.readDefinition(work.id, id)).nodes[0].task,
    d.nodes[0].task,
  );
  const saved = JSON.parse(
    await readFile(join(root, work.id, 'work.json'), 'utf8'),
  );
  assert.equal(saved.definitions, undefined);
  assert.match(
    await readFile(join(root, work.id, 'definitions', `${id}.js`), 'utf8'),
    /^export default /,
  );
});

test('并发保存采用版本检查，旧提案不能覆盖新草稿；布局不改变版本', async (t) => {
  const { files, flow, work } = await setup(t);
  const id = await flow.saveDraft(work.id, undefined, definition());
  const a = definition(),
    b = definition();
  a.nodes[0].task = 'A';
  b.nodes[0].task = 'B';
  const saves = await Promise.allSettled([
    flow.saveDraft(work.id, id, a),
    flow.saveDraft(work.id, id, b),
  ]);
  assert.equal(saves.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(saves.filter((x) => x.status === 'rejected').length, 1);
  const current = await files.read(work.id);
  await flow.saveLayout(work.id, { positions: { classify: { x: 10, y: 5 } } });
  assert.equal((await files.read(work.id)).draftId, current.draftId);
  assert.equal(
    await flow.saveDraft(
      work.id,
      current.draftId,
      await files.readDefinition(work.id, current.draftId!),
    ),
    current.draftId,
  );
});

test('候选起点明确且不同草稿需要显式替换，采用/放弃不删除历史', async (t) => {
  const { files, flow, work } = await setup(t);
  const d1 = await flow.saveDraft(work.id, undefined, definition());
  await flow.adopt(work.id, d1);
  const changed = definition();
  changed.nodes[0].task = '改变分类';
  const d2 = await flow.saveDraft(work.id, d1, changed);
  await assert.rejects(flow.beginCandidate(work.id, d1), /草稿/);
  assert.equal((await files.read(work.id)).draftId, d2);
  await flow.beginCandidate(work.id, d1, true);
  assert.equal((await files.read(work.id)).draftBaseId, d1);
  const d3 = await flow.saveDraft(work.id, d1, changed);
  await flow.beginCandidate(work.id, d3);
  assert.equal((await files.read(work.id)).draftBaseId, d1);
  await flow.adopt(work.id, d3);
  await flow.discardDraft(work.id);
  const final = await files.read(work.id);
  assert.equal(final.adoptedId, d3);
  assert.equal(final.draftId, d3);
  assert.deepEqual(await files.readDefinition(work.id, d2), changed);
  await assert.rejects(flow.beginCandidate(work.id, 'unknown'), /定义|版本/);
});

test('未完成配置允许保存但不能运行，结构坏类型拒绝且不替换草稿', async (t) => {
  const { files, flow, work } = await setup(t);
  const d = definition();
  d.nodes[0].task = '';
  const id = await flow.saveDraft(work.id, undefined, d);
  assert.ok(
    (await flow.snapshot(work.id)).issues.some((i) => i.nodeId === 'classify'),
  );
  assert.throws(() => validateForRun(d), /任务/);
  await assert.rejects(
    flow.saveDraft(work.id, id, {
      ...d,
      nodes: 'bad',
    } as unknown as Definition),
  );
  assert.equal((await files.read(work.id)).draftId, id);
});

test('校验定位缺输入、坏端口、重复来源、回连、输出和函数参数', () => {
  assert.deepEqual(checkDefinition(definition()), []);
  const d = definition();
  d.edges = [
    { from: ['classify', 'wrong'], to: ['report', 'input'] },
    { from: ['report', 'output'], to: ['classify', 'input'] },
    { from: ['$input', 'feedback'], to: ['report', 'input'] },
  ];
  const issues = checkDefinition(d);
  assert.ok(issues.some((i) => i.edgeIndex === 0));
  assert.ok(issues.some((i) => i.message.includes('环')));
  assert.ok(issues.some((i) => i.message.includes('来源')));
  const missing = definition();
  missing.edges = [];
  assert.ok(
    checkDefinition(missing).some(
      (i) => i.nodeId === 'classify' && i.message.includes('输入'),
    ),
  );
  const bad = definition();
  bad.outputs.report = ['gone', 'output'];
  bad.nodes[0] = {
    id: 'classify',
    label: '筛选',
    kind: 'function',
    mode: 'each',
    functionName: 'select-fields',
    params: { fields: [] },
  };
  assert.ok(checkDefinition(bad).some((i) => i.field === 'outputs.report'));
  assert.ok(checkDefinition(bad).some((i) => i.nodeId === 'classify'));
});

test('条件分支和显式汇合有效，空分支不要求不存在的实例', () => {
  const d: Definition = {
    schemaVersion: 1,
    inputs: ['input'],
    nodes: [
      {
        id: 'branch',
        label: '分流',
        kind: 'branch',
        mode: 'all',
        condition: { field: 'category', operator: 'equals', value: '问题' },
      },
      {
        id: 'merge',
        label: '汇合',
        kind: 'function',
        mode: 'all',
        functionName: 'merge',
      },
    ],
    edges: [
      { from: ['$input', 'input'], to: ['branch', 'input'] },
      { from: ['branch', 'matched'], to: ['merge', 'left'] },
      { from: ['branch', 'unmatched'], to: ['merge', 'right'] },
    ],
    outputs: { result: ['merge', 'output'] },
  };
  assert.deepEqual(checkDefinition(d), []);
  d.nodes[0].condition = { field: '', operator: 'contains', value: '问题' };
  assert.deepEqual(checkDefinition(d), []);
});

test('保留与采用独立，旧新结果仅按明确选择预览并拒绝重叠来源', async (t) => {
  const { files, flow, service, work } = await setup(t);
  const id = await flow.saveDraft(work.id, undefined, definition());
  await flow.adopt(work.id, id);
  const [m1, m2, m3] = work.materials.map((m) => m.id);
  const results = [
    result('old1', [m1]),
    result('old2', [m2]),
    result('old3', [m3]),
    result('new1', [m1]),
    result('aggregate', [m1, m2]),
    result('failed', [m3], 'failed'),
  ];
  await files.change(work.id, (w) => {
    w.runs = [run(results)];
  });
  await service.keepResults(work.id, ['new1', 'new1']);
  assert.deepEqual((await files.read(work.id)).keptResultIds, ['new1']);
  assert.equal((await files.read(work.id)).adoptedId, id);
  const preview = await service.previewResults(work.id, [
    'old2',
    'old3',
    'new1',
  ]);
  assert.equal(preview.input.length, 3);
  assert.deepEqual(
    preview.input.map((x) => x.sourceResultIds),
    [['old2'], ['old3'], ['new1']],
  );
  await assert.rejects(
    service.previewResults(work.id, ['old1', 'new1']),
    /重叠|重复/,
  );
  await assert.rejects(
    service.previewResults(work.id, ['aggregate', 'new1']),
    /重叠|重复/,
  );
  await assert.rejects(
    service.previewResults(work.id, ['old1', 'old1']),
    /重复/,
  );
  await assert.rejects(service.keepResults(work.id, ['failed']), /成功/);
  await assert.rejects(service.previewResults(work.id, ['missing']), /结果/);
});

test('缺目标和材料报错，追加材料保持旧材料与结果', async (t) => {
  const { files, service, work } = await setup(t);
  await assert.rejects(service.createWork(' ', ['材料']), /目标/);
  await assert.rejects(service.createWork('目标', []), /材料/);
  await assert.rejects(service.addMaterials(work.id, [' ']), /材料/);
  await service.addMaterials(work.id, ['筛选后页码错乱']);
  const current = await files.read(work.id);
  assert.deepEqual(current.materials.slice(0, 3), work.materials);
  assert.equal(current.materials.length, 4);
  assert.equal(new Set(current.materials.map((m) => m.id)).size, 4);
});

test('串行修改无覆盖，失败不通知且磁盘旧状态可读', async (t) => {
  const { root, files, work } = await setup(t);
  let notified = 0;
  files.onChange(() => {
    notified++;
  });
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      files.change(work.id, (w) => {
        w.keptResultIds.push(String(i));
      }),
    ),
  );
  assert.equal((await files.read(work.id)).keptResultIds.length, 8);
  assert.equal(notified, 8);
  const before = await readFile(join(root, work.id, 'work.json'), 'utf8');
  await assert.rejects(
    files.change(work.id, () => {
      throw new Error('写入前失败');
    }),
  );
  assert.equal(
    await readFile(join(root, work.id, 'work.json'), 'utf8'),
    before,
  );
  assert.equal(notified, 8);
  await chmod(join(root, work.id), 0o500);
  try {
    await assert.rejects(
      files.change(work.id, (w) => {
        w.goal = '不会成功保存';
      }),
    );
  } finally {
    await chmod(join(root, work.id), 0o700);
  }
  assert.equal(
    await readFile(join(root, work.id, 'work.json'), 'utf8'),
    before,
  );
  assert.equal(notified, 8);
  // Making the definitions directory a plain file creates a genuine filesystem write failure.
  await rm(join(root, work.id, 'definitions'), {
    recursive: true,
    force: true,
  });
  await import('node:fs/promises').then((fs) =>
    fs.writeFile(join(root, work.id, 'definitions'), 'blocked'),
  );
  await assert.rejects(files.writeDefinition(work.id, definition()));
  assert.deepEqual((await files.read(work.id)).definitionIds, []);
  assert.equal(notified, 8);
});

test('刷新只读保留运行中，服务器重启如实中断并保存已完成结果', async (t) => {
  const { root, files, work } = await setup(t);
  const done = result('done', [work.materials[0].id]),
    pending = result('pending', [work.materials[1].id], 'running');
  const active = run([done, pending]);
  active.status = 'running';
  active.nodeStates = { classify: 'running', report: 'queued' };
  await files.change(work.id, (w) => {
    w.runs = [active];
    w.comparisons = [
      {
        id: 'cmp',
        baselineId: 'd1',
        candidateId: 'd2',
        nodeId: 'classify',
        frozenInputs: {},
        status: 'queued',
        stopRequested: false,
        createdAt: new Date().toISOString(),
      },
    ];
    w.messages = [
      { id: 'msg', role: 'assistant', text: '', status: 'running' },
    ];
  });
  const reopened = createFiles(root);
  assert.equal((await reopened.read(work.id)).runs[0].status, 'running');
  await reopened.onServerStart();
  const next = await reopened.read(work.id);
  assert.equal(next.runs[0].status, 'interrupted');
  assert.equal(next.runs[0].results[0].status, 'completed');
  assert.equal(next.runs[0].results[1].status, 'interrupted');
  assert.equal(next.runs[0].nodeStates.report, 'interrupted');
  assert.equal(next.comparisons[0].status, 'interrupted');
  assert.equal(next.messages[0].status, 'interrupted');
});

test('材料使用工作内短编号，并发追加后重开继续递增', async (t) => {
  const { root, files, service, work } = await setup(t);
  assert.deepEqual(
    work.materials.map((m) => m.id),
    ['M01', 'M02', 'M03'],
  );
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      service.addMaterials(work.id, [`新增材料 ${i}`]),
    ),
  );
  const saved = await files.read(work.id);
  assert.deepEqual(
    saved.materials.map((m) => m.id),
    Array.from({ length: 13 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`),
  );
  const reopened = createFiles(root);
  assert.deepEqual((await reopened.read(work.id)).materials, saved.materials);
  await createWorkService(reopened).addMaterials(work.id, ['重开后新增']);
  assert.equal((await reopened.read(work.id)).materials.at(-1)?.id, 'M14');
  const other = await service.createWork('另一个工作', ['另一份材料']);
  assert.equal(other.materials[0].id, 'M01');
});

test('旧材料与结果引用保持原样，新增编号从工作已用最大编号递增', async (t) => {
  const { root, files, service, work } = await setup(t);
  const oldId = '71b5992f-7355-4984-9d52-431ea3b17535';
  await files.change(work.id, (w) => {
    w.materials = [
      { id: oldId, text: '旧材料' },
      { id: 'M17', text: '已有短编号材料' },
    ];
    w.runs = [run([result('old-result', [oldId])])];
  });
  const before = await files.read(work.id);
  await service.addMaterials(work.id, ['新的材料', '另一条新材料']);
  const after = await createFiles(root).read(work.id);
  assert.deepEqual(after.materials.slice(0, 2), before.materials);
  assert.deepEqual(after.runs, before.runs);
  assert.deepEqual(
    after.materials.slice(2).map((m) => m.id),
    ['M18', 'M19'],
  );
});

test('工作列表按标题和目标搜索、分页，重命名与归档恢复持久化', async (t) => {
  const { root, files, service, work } = await setup(t);
  const second = await service.createWork('调查客户留存并归纳改进计划', [
    '材料',
  ]);
  const third = await service.createWork('制作每周采购报告', ['材料']);
  assert.equal(work.title, '整理客户反馈');
  await service.rename(work.id, '客户声音');
  await files.change(work.id, (w) => {
    w.updatedAt = '2026-09-20T01:00:00Z';
  });
  const search = await service.listWorks({
    query: '客户',
    page: 1,
    pageSize: 1,
  });
  assert.equal(search.total, 2);
  assert.equal(search.works.length, 1);
  assert.equal(search.pageSize, 1);
  const next = await service.listWorks({ query: '客户', page: 2, pageSize: 1 });
  assert.equal(next.works.length, 1);
  assert.notEqual(next.works[0].id, search.works[0].id);
  assert.equal(
    (await service.listWorks({ query: '客户声音' })).works[0].id,
    work.id,
  );
  assert.equal(
    (await service.listWorks({ query: '整理客户反馈' })).works[0].id,
    work.id,
  );
  await service.archive(work.id, true);
  assert.equal((await service.listWorks({})).total, 2);
  const archived = await service.listWorks({ archived: true });
  assert.deepEqual(
    archived.works.map((w) => w.id),
    [work.id],
  );
  assert.ok(archived.works[0].archivedAt);
  const reopened = createWorkService(createFiles(root));
  assert.equal(
    (await reopened.listWorks({ archived: true })).works[0].title,
    '客户声音',
  );
  assert.equal((await files.read(work.id)).titleEdited, true);
  await reopened.archive(work.id, false);
  assert.equal((await reopened.listWorks({})).total, 3);
  assert.equal((await reopened.listWorks({ archived: true })).total, 0);
  assert.equal((await files.read(work.id)).title, '客户声音');
  assert.equal((await files.read(second.id)).goal, second.goal);
  assert.equal((await files.read(third.id)).goal, third.goal);
});

test('短标题初值、旧工作回退与列表边界清楚', async (t) => {
  const { files, service, work } = await setup(t);
  const goal =
    '这是一份非常长的目标说明，需要整理全部客户材料并提出明确可靠且能执行的行动建议';
  const created = await service.createWork(goal, ['材料']);
  assert.equal(created.title, Array.from(goal).slice(0, 28).join(''));
  await files.change(work.id, (w) => {
    delete w.title;
    delete w.titleEdited;
  });
  assert.equal(
    (await service.listWorks({ query: work.goal })).works[0].title,
    work.goal,
  );
  await assert.rejects(service.rename(work.id, '   '), /标题/);
  await assert.rejects(service.rename(work.id, '长'.repeat(81)), /80/);
  assert.equal((await service.listWorks({ query: '不存在的标题' })).total, 0);
  const page = await service.listWorks({ page: 999, pageSize: 1 });
  assert.equal(page.page, 2);
  assert.equal(page.works.length, 1);
  await assert.rejects(service.listWorks({ page: 0 }), /分页/);
  await assert.rejects(service.listWorks({ pageSize: 0 }), /分页/);
});
