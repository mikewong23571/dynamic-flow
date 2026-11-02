import { test, expect } from './fixtures';
import type { Definition } from '../../src/shared/records';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const definition: Definition = {
  schemaVersion: 1,
  inputs: ['data', 'supplement'],
  inputContracts: {
    supplement: {
      required: false,
      item: {
        type: 'object',
        properties: {
          recordId: { type: 'string', title: '记录编号' },
          value: { type: 'string', title: '补充说明' },
        },
        required: ['recordId', 'value'],
      },
    },
  },
  nodes: [
    {
      id: 'prepare',
      label: '整理待核对内容',
      kind: 'function',
      functionName: 'identity',
      operation: 'map',
    },
    {
      id: 'stage',
      label: '记录范围核对进展',
      kind: 'milestone',
      milestone: { stage: '核对适用范围', summary: '已整理资料，等待补充范围' },
    },
    {
      id: 'wait',
      label: '等待范围确认',
      kind: 'wait',
      wait: { event: 'scope.ready', reason: '请补充适用范围后继续核对' },
    },
  ],
  edges: [
    { from: ['$input', 'data'], to: ['prepare', 'input'] },
    { from: ['prepare', 'output'], to: ['stage', 'input'] },
    { from: ['stage', 'output'], to: ['wait', 'input'] },
  ],
  outputs: { stage: ['prepare', 'output'], final: ['wait', 'output'] },
};
const source = `root = Workspace("资料核对", [navigation])
navigation = ViewNavigation("tabs", [workView])
workView = View("核对内容", [current, supplied, findings, supplement, finalReport])
received = Query("read_inputs", {inputPort: "data"}, {rows: []}, 1)
supplied = DataTable("已提供资料", received.rows, "id", [Field("id", "资料编号"), Field("finding", "核对事项")])
state = Query("read_workspace", {}, {item: {}}, 1)
current = Details("当前工作", state.item, [Field("stage", "当前环节"), Field("summary", "进展"), Field("blocker", "需要补充"), Field("nextAction", "下一步")])
observed = Query("read_output", {output: "stage"}, {rows: [], sources: []}, 1)
findings = DataTable("已整理资料", observed.rows, "id", [Field("id", "资料编号"), Field("finding", "待确认事项")], null, [], [Field("finding", "待确认事项")], observed.sources)
$draft = {}
supplement = InputForm("supplement", "补充范围", $draft, save)
save = ActionButton("保存补充说明", @Run(submit))
submit = Mutation("submit_input", {inputPort: "supplement", value: $draft})
finalReport = Report("final", "核对结果", [Field("id", "资料编号"), Field("finding", "核对结论")])`;

for (const width of [1440, 1024]) {
  test(`单项未交付阶段可见、真实进展自动更新、表单写入 ${width}`, async ({
    page,
    application,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const item = await application.items.create({
      title: '资料范围核对',
      goal: '核对实际资料并确认范围',
      materials: [],
    });
    let ws = await application.composition.snapshot(item.id);
    ws = await application.composition.saveFlow(
      item.id,
      ws.item.revision,
      definition,
      ws.work!.work.draftId,
    );
    ws = await application.composition.addInput(
      item.id,
      ws.item.revision,
      'data',
      '资料一',
      { id: 'D1', finding: '尚缺部署版本与适用范围' },
    );
    ws = await application.composition.saveUiProgram(
      item.id,
      ws.item.revision,
      { definitionId: ws.work!.work.draftId, source },
    );
    await page.goto(`/items/${item.id}?tab=results`);
    const ui = page.locator('[data-openui-renderer="official"]');
    await expect(
      ui.getByRole('heading', { name: '当前工作', exact: true }),
    ).toBeVisible();
    await expect(
      ui.getByRole('region', { name: '已提供资料', exact: true }),
    ).toContainText('尚缺部署版本与适用范围');
    await expect(
      ui.getByRole('region', { name: '已整理资料', exact: true }),
    ).not.toContainText('尚缺部署版本与适用范围');
    await page.getByRole('button', { name: '工作项更多操作' }).click();
    await page
      .getByRole('menuitem', { name: '执行当前方案', exact: true })
      .click();
    await expect(
      ui
        .getByRole('region', { name: '已整理资料', exact: true })
        .getByText('尚缺部署版本与适用范围', { exact: true }),
    ).toBeVisible();
    expect((await application.items.get(item.id)).deliveries).toHaveLength(0);
    await expect(ui.getByText('核对适用范围', { exact: true })).toBeVisible();
    await ui.getByRole('textbox', { name: '记录编号', exact: true }).fill('D1');
    await ui
      .getByRole('textbox', { name: '补充说明', exact: true })
      .fill('实际部署版本为3.2，适用于内部环境');
    await ui.getByRole('button', { name: '保存补充说明', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await application.items.get(item.id)).receivedInputs?.at(-1)?.value,
      )
      .toEqual({ recordId: 'D1', value: '实际部署版本为3.2，适用于内部环境' });
    expect((await application.items.get(item.id)).execution?.status).toBe(
      'waiting',
    );
    const artifact =
      process.env.FLOWCRAFT_EVIDENCE_DIR ||
      '/tmp/flowcraft-visibility-evidence';
    await mkdir(artifact, { recursive: true });
    await page.screenshot({ path: join(artifact, `single-${width}.png`) });
    const frozen = (await application.files.read(item.workId)).runs[0].inputs;
    await application.items.signal(
      item.id,
      {
        id: 'scope-confirmed',
        name: 'scope.ready',
        payload: '已确认原记录范围',
      },
      application.runs.signal,
    );
    await expect
      .poll(
        async () => (await application.items.get(item.id)).execution?.status,
      )
      .toBe('completed');
    await page.getByRole('button', { name: '工作项更多操作' }).click();
    await page
      .getByRole('menuitem', { name: '保留本轮成果', exact: true })
      .click();
    const report = ui.locator('.composition-delivery').filter({
      has: page.getByRole('heading', { name: '核对结果', exact: true }),
    });
    await expect(report.getByText('核对结论', { exact: true })).toBeVisible();
    await expect(
      report.getByText('尚缺部署版本与适用范围', { exact: true }),
    ).toBeVisible();
    expect((await application.files.read(item.workId)).runs[0].inputs).toEqual(
      frozen,
    );
    expect((await application.items.get(item.id)).status).toBe('open');
    const current = await application.composition.snapshot(item.id);
    await application.composition.saveUiProgram(
      item.id,
      current.item.revision,
      {
        definitionId: current.uiProgram!.definitionId,
        expectedProgramId: current.uiProgram!.id,
        patch:
          'navigation = ViewNavigation("tabs", [updatedView])\nupdatedView = View("继续核对", [current, supplied, findings, supplement, finalReport])',
      },
    );
    await expect(
      ui.getByRole('tab', { name: '继续核对', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      ui.getByRole('region', { name: '已提供资料', exact: true }),
    ).toBeVisible();
  });
  test(`子项业务清单与统计读取实时事实，重命名标签不改业务 ${width}`, async ({
    page,
    application,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const parent = await application.items.create({
      title: '批次范围确认',
      goal: '逐项确认实际范围',
      materials: [],
    });
    const first = await application.items.create({
      title: '核对服务A',
      criteria: ['范围已核对'],
      goal: '确认A范围',
      materials: [],
      parentId: parent.id,
    });
    const second = await application.items.create({
      title: '核对服务B',
      goal: '确认B范围',
      materials: [],
      parentId: parent.id,
    });
    let ws = await application.composition.snapshot(parent.id);
    ws = await application.composition.saveFlow(
      parent.id,
      ws.item.revision,
      definition,
      ws.work!.work.draftId,
    );
    const program = `root = Workspace("范围确认", [counts, list])
counts = Section("范围核对", [total, done])
children = Query("read_children", {scope: "children"}, {items: [], scopeSummary: {total: null, completed: null}}, 1)
total = Metric("纳入范围", children.scopeSummary.total)
done = Metric("已确认", children.scopeSummary.completed)
list = DataTable("待核对服务", children.items, "id", [Field("title", "服务"), Field("stage", "核对阶段"), Field("summary", "进展"), Field("blocker", "缺失材料")], null, [], [Field("goal", "核对目标"), Field("nextAction", "后续处理")])`;
    ws = await application.composition.saveUiProgram(
      parent.id,
      ws.item.revision,
      { definitionId: ws.work!.work.draftId, source: program },
    );
    await page.goto(`/items/${parent.id}?tab=results`);
    const ui = page.locator('[data-openui-renderer="official"]');
    await expect(ui.getByText('核对服务A', { exact: true })).toBeVisible();
    await expect(
      ui.locator('.openui-metric').filter({ hasText: '纳入范围' }),
    ).toContainText('2');
    await expect(
      ui.locator('.openui-metric').filter({ hasText: '已确认' }),
    ).toContainText('0');
    await application.items.reportProgress(second.id, {
      id: 'actual-B-gap',
      expectedRevision: (await application.items.get(second.id)).revision,
      stage: '等待部署材料',
      summary: 'B缺少部署版本',
      blocker: '补部署清单',
      nextAction: '提交实际部署版本',
    });
    await application.items.criteria(
      first.id,
      first.criteria.map((c) => ({
        ...c,
        met: true,
        evidence: '已人工核对服务A范围',
      })),
    );
    await application.items.complete(first.id);
    await expect(ui.getByText('等待部署材料', { exact: true })).toBeVisible();
    await expect(ui.getByText('补部署清单', { exact: true })).toBeVisible();
    await expect(
      ui.locator('.openui-metric').filter({ hasText: '已确认' }),
    ).toContainText('1');
    const sourceId = ws.uiProgram!.id;
    ws = await application.composition.snapshot(parent.id);
    await application.composition.saveUiProgram(parent.id, ws.item.revision, {
      definitionId: ws.uiProgram!.definitionId,
      expectedProgramId: sourceId,
      patch: 'total = Metric("需核对服务数", children.scopeSummary.total)',
    });
    await expect(
      ui.locator('.openui-metric').filter({ hasText: '需核对服务数' }),
    ).toContainText('2');
    expect((await application.items.get(first.id)).status).toBe('completed');
    expect((await application.items.get(parent.id)).deliveries).toHaveLength(0);
    const artifact =
      process.env.FLOWCRAFT_EVIDENCE_DIR ||
      '/tmp/flowcraft-visibility-evidence';
    await mkdir(artifact, { recursive: true });
    await page.screenshot({ path: join(artifact, `children-${width}.png`) });
  });
}
