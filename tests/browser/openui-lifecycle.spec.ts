import { test, expect, type APIRequestContext } from './fixtures';
import type { Definition } from '../../src/shared/records';
import type { ItemWorkspace } from '../../src/shared/workitem-composition';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

async function workspace(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/items/${id}/workspace`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as ItemWorkspace;
}
async function command(
  request: APIRequestContext,
  id: string,
  action: string,
  fields: Record<string, unknown> = {},
) {
  const before = await workspace(request, id);
  const response = await request.post(`/api/items/${id}/workspace/actions`, {
    data: { action, baseRevision: before.item.revision, ...fields },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as ItemWorkspace;
}
async function create(
  request: APIRequestContext,
  title: string,
  materials: string[],
) {
  const response = await request.post('/api/items', {
    data: {
      title,
      goal: '检查固定输入与成果，人工确认后结项',
      materials,
      criteria: ['依据已人工核对'],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function save(
  request: APIRequestContext,
  id: string,
  definition: Definition,
  source: string,
) {
  let ws = await command(request, id, 'saveFlow', {
    definition,
    expectedDraftId: (await workspace(request, id)).work?.work.draftId,
  });
  for (const inputPort of definition.inputs)
    ws = await command(request, id, 'selectInputs', {
      inputPort,
      materialIds: ws.item.materials.map((m) => m.id),
    });
  return command(request, id, 'saveUiProgram', {
    definitionId: ws.work!.work.draftId,
    source,
  });
}
async function completed(request: APIRequestContext, id: string) {
  await expect
    .poll(async () => (await workspace(request, id)).item.execution?.status)
    .toBe('completed');
  return workspace(request, id);
}
const reportProgram = `root = Workspace("调查结果", [report, review])
report = Report("report", "本轮调查")
review = ActionButton("人工验收", @Run(openReview))
openReview = Mutation("review", {})`;
const recordsProgram = `root = Workspace("目标核查", [records])
$selected = []
records = Records("rows", "核查记录", "id", [Field("id", "编号"), Field("target", "目标"), Field("conclusion", "结论")], $selected, [], [Field("target", "原始目标"), Field("reason", "核查依据")], null, true)`;

for (const width of [1440, 1024]) {
  test(`子项独立业务输入、逐条候选回执和父子返回 ${width}`, async ({
    page,
    request,
    application,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const parent = await create(request, '整批问题跟进', ['父项原始材料']);
    const candidates = [
      {
        id: 'valid',
        title: '核查目标A',
        goal: '确认固定版本',
        trackingKey: 'target-A',
        inputs: [
          {
            label: '原始目标',
            value: { repository: 'repo/A', ref: 'develop' },
          },
        ],
      },
      { id: 'missing', title: '目标B', goal: '', inputs: [] },
    ];
    const first = await application.items.createChildren(parent.id, {
      candidates,
    });
    expect(first.receipts.map((r) => r.status)).toEqual([
      'created',
      'needs-input',
    ]);
    const again = await application.items.createChildren(parent.id, {
      candidates,
    });
    expect(again.receipts[0].childId).toBe(first.receipts[0].childId);
    const child = await application.items.get(first.receipts[0].childId!);
    expect(child.workId).not.toBe(parent.workId);
    expect(child.materials).toEqual([]);
    expect(child.receivedInputs![0].value).toEqual({
      repository: 'repo/A',
      ref: 'develop',
    });
    await page.goto(`/items/${parent.id}?tab=flow`);
    await page
      .getByRole('button', { name: '工作项更多操作', exact: true })
      .click();
    await page.getByRole('menuitem', { name: '子工作项', exact: true }).click();
    const relations = page.getByRole('dialog', {
      name: '子工作项',
      exact: true,
    });
    await expect(relations.locator('tbody tr')).toHaveCount(1);
    await relations
      .getByRole('button', { name: '核查目标A 确认固定版本', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: '核查目标A', exact: true }),
    ).toBeVisible();
    await page.getByRole('tab', { name: '输入', exact: true }).click();
    await expect(
      page.getByRole('region', { name: '输入资料', exact: true }),
    ).toContainText('原始目标');
    const saved = await workspace(request, child.id);
    expect(saved.item.parentId).toBe(parent.id);
    expect(saved.item.receivedInputs![0].value).toEqual({
      repository: 'repo/A',
      ref: 'develop',
    });
    expect(saved.item.runs).toHaveLength(0);
  });

  test(`唯一工作项流程：等待事件、正式成果、人工结项与新证据重开 ${width}`, async ({
    page,
    request,
    application,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const item = await create(request, '等待厂商公告后复核', ['原始扫描记录']);
    const definition: Definition = {
      schemaVersion: 1,
      inputs: ['materials'],
      nodes: [
        {
          id: 'wait',
          label: '等待厂商公告',
          kind: 'wait',
          wait: { event: 'vendor.ready', reason: '等待厂商补充固定版本' },
        },
        {
          id: 'report',
          label: '整理核查依据',
          kind: 'function',
          operation: 'aggregate',
          functionName: 'expression',
          expression: {
            kind: 'literal',
            value: '固定版本公告已到，须人工核对后结项。',
          },
        },
      ],
      edges: [
        { from: ['$input', 'materials'], to: ['wait', 'input'] },
        { from: ['wait', 'output'], to: ['report', 'input'] },
      ],
      outputs: { report: ['report', 'output'] },
    };
    await save(request, item.id, definition, reportProgram);
    await page.goto(`/items/${item.id}?tab=flow`);
    await page.getByRole('button', { name: '运行流程', exact: true }).click();
    await expect
      .poll(
        async () => (await workspace(request, item.id)).item.execution?.status,
      )
      .toBe('waiting');
    const evidence =
      process.env.FLOWCRAFT_EVIDENCE_DIR || 'test-results/openui-evidence';
    await mkdir(evidence, { recursive: true });
    let ws = await workspace(request, item.id);
    const runId = ws.item.runs.at(-1)!.runId;
    expect(ws.item.status).toBe('open');
    expect(ws.deliveries).toHaveLength(0);
    await expect(
      page.getByText('等待厂商补充固定版本', { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: join(evidence, `waiting-${width}.png`) });
    await page
      .getByRole('button', { name: '提交事件', exact: true })
      .first()
      .click();
    const event = page.getByRole('dialog', {
      name: '提交等待事件',
      exact: true,
    });
    await expect(event.getByLabel('事件', { exact: true })).toHaveValue(
      'vendor.ready',
    );
    await event
      .getByLabel('补充内容', { exact: true })
      .fill('厂商已补充固定版本公告');
    await event.getByRole('button', { name: '提交事件', exact: true }).click();
    ws = await completed(request, item.id);
    expect(ws.item.runs).toHaveLength(1);
    expect(ws.item.runs[0].runId).toBe(runId);
    expect(ws.item.status).toBe('open');
    const frozen = structuredClone(ws.work!.work.runs[0]);
    await page.getByRole('tab', { name: '工作', exact: true }).click();
    await page.getByRole('button', { name: '工作项更多操作' }).click();
    await page
      .getByRole('menuitem', { name: '保留本轮成果', exact: true })
      .click();
    await expect(
      page
        .getByRole('tabpanel', { name: '工作', exact: true })
        .getByText('固定版本公告已到，须人工核对后结项。', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '人工验收', exact: true }).click();
    const review = page.getByRole('dialog', { name: '完成条件', exact: true });
    await expect(
      review.getByRole('button', { name: '确认结项', exact: true }),
    ).toBeDisabled();
    await review
      .getByRole('checkbox', { name: '确认条件 1', exact: true })
      .check();
    await review
      .getByRole('textbox', { name: '条件依据 1', exact: true })
      .fill('已人工逐项核对固定版本公告与扫描记录');
    await review.getByRole('button', { name: '保存条件', exact: true }).click();
    await expect(
      review.getByRole('button', { name: '确认结项', exact: true }),
    ).toBeEnabled();
    await review.getByRole('button', { name: '确认结项', exact: true }).click();
    await expect
      .poll(async () => (await workspace(request, item.id)).item.status)
      .toBe('completed');
    await review.getByRole('button', { name: '重新打开', exact: true }).click();
    const reopen = page.getByRole('dialog', {
      name: '重新打开工作项',
      exact: true,
    });
    await reopen
      .getByLabel('重开原因', { exact: true })
      .fill('收到新的扫描范围，需要重新确认');
    await reopen.getByRole('button', { name: '重新打开', exact: true }).click();
    await expect
      .poll(async () => (await workspace(request, item.id)).item.status)
      .toBe('open');
    await page.getByRole('tab', { name: '输入', exact: true }).click();
    await page.getByRole('button', { name: '补充材料', exact: true }).click();
    const material = page.getByRole('dialog', {
      name: '补充材料',
      exact: true,
    });
    await material
      .getByRole('textbox', { name: '材料内容', exact: true })
      .fill('新扫描范围的补充证据');
    await material
      .getByRole('button', { name: '保存材料', exact: true })
      .click();
    await expect(material).toBeHidden();
    ws = await workspace(request, item.id);
    expect(ws.item.workId).toBe(item.workId);
    expect(ws.item.materials).toHaveLength(2);
    expect(ws.item.runs).toHaveLength(1);
    expect(ws.work!.work.runs[0]).toEqual(frozen);
    expect(ws.item.criteria[0].met).toBe(false);
    expect((await application.files.read(item.workId)).materials).toEqual([]);
    await page.getByRole('tab', { name: '记录', exact: true }).click();
    await expect(
      page.getByRole('list', { name: '工作记录', exact: true }),
    ).toContainText('收到新的扫描范围，需要重新确认');
    await page.screenshot({ path: join(evidence, `lifecycle-${width}.png`) });
  });

  test(`31条真实成果分页、详情来源与再次执行不改写旧交付 ${width}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const item = await create(
      request,
      '逐目标核查成果',
      Array.from({ length: 31 }, (_, i) => `repo/${i + 1}`),
    );
    const definition: Definition = {
      schemaVersion: 1,
      inputs: ['materials'],
      nodes: [
        {
          id: 'check',
          label: '逐目标记录',
          kind: 'function',
          operation: 'map',
          functionName: 'expression',
          expression: {
            kind: 'object',
            fields: {
              id: { kind: 'variable', name: 'input' },
              target: { kind: 'variable', name: 'input' },
              conclusion: { kind: 'literal', value: '待人工复核' },
              reason: {
                kind: 'literal',
                value: '原始目标需核对固定提交。'.repeat(80),
              },
            },
          },
        },
      ],
      edges: [{ from: ['$input', 'materials'], to: ['check', 'input'] }],
      outputs: { rows: ['check', 'output'] },
    };
    await save(request, item.id, definition, recordsProgram);
    await command(request, item.id, 'run');
    let ws = await completed(request, item.id);
    const firstRun = structuredClone(ws.work!.work.runs[0]);
    ws = await command(request, item.id, 'publishDelivery', {
      runId: firstRun.id,
      output: 'rows',
      programId: ws.uiProgram!.id,
    });
    const firstDelivery = structuredClone(ws.deliveries[0]);
    expect(firstDelivery.sources).toHaveLength(31);
    expect(new Set(firstDelivery.sources.map((s) => s.resultId)).size).toBe(31);
    expect(firstRun.results.every((r) => r.input.input.length === 1)).toBe(
      true,
    );
    expect(
      firstRun.results.map((r) => r.input.input[0].materialIds[0]),
    ).toEqual(ws.item.materials.map((m) => m.id));
    await page.goto(`/items/${item.id}?tab=results`);
    const records = page.getByRole('region', { name: '成果记录', exact: true });
    await expect(
      records.getByRole('button', { name: /^查看记录 / }),
    ).toHaveCount(25);
    await records.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(
      records.getByRole('button', { name: /^查看记录 / }),
    ).toHaveCount(6);
    await records
      .getByRole('button', { name: '查看记录 repo/31', exact: true })
      .click();
    const detail = page.getByRole('dialog', {
      name: '核查记录详情',
      exact: true,
    });
    await expect(detail).toContainText('repo/31');
    await expect(detail).toContainText('原始目标需核对固定提交。');
    const evidence =
      process.env.FLOWCRAFT_EVIDENCE_DIR || 'test-results/openui-evidence';
    await mkdir(evidence, { recursive: true });
    await page.screenshot({
      path: join(evidence, `record-detail-${width}.png`),
    });
    await detail.getByRole('button', { name: '查看来源', exact: true }).click();
    await expect(page.locator('.run-inspector')).toHaveAttribute(
      'data-run-id',
      firstRun.id,
    );
    await expect(page.locator('.run-inspector')).toContainText('repo/31');
    await expect(
      page.locator(
        `.item-retained-artifact[data-result-id="${firstDelivery.sources[30].resultId}"]`,
      ),
    ).toBeVisible();
    await command(request, item.id, 'run');
    ws = await completed(request, item.id);
    expect(ws.item.runs).toHaveLength(2);
    expect(ws.work!.work.runs[0]).toEqual(firstRun);
    expect(ws.deliveries[0]).toEqual(firstDelivery);
    expect(ws.item.status).toBe('open');
    await page.goto(`/items/${item.id}?tab=results`);
    await records
      .getByRole('textbox', { name: '搜索成果记录', exact: true })
      .fill('repo/31');
    await expect(
      records.getByRole('button', { name: /^查看记录 / }),
    ).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
