import { test, expect, type APIRequestContext } from './fixtures';
import type { Definition } from '../../src/shared/records';
import type { ItemWorkspace } from '../../src/shared/workitem-composition';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const source = `root = Workspace("反馈处理", [records, form, opener, editor])
$selected = []
$draft = {}
records = Records("rows", "处理清单", "id", [Field("id", "编号"), Field("title", "反馈"), Field("status", "状态")], $selected, [next], [Field("title", "反馈内容"), Field("reason", "依据")])
next = ActionButton("继续所选记录", @Run(continueStep))
continueStep = Mutation("continue_records", {output: "rows", recordIds: $selected, inputPort: "materials"})
form = InputForm("request", "补充范围", $draft, save)
save = ActionButton("保存输入", @Run(saveInput))
saveInput = Mutation("submit_input", {inputPort: "request", value: $draft})
$editing = false
opener = ActionButton("补充当前记录", @Set($editing, true), "secondary")
editor = Dialog("补充任务", $editing, [TextContent("检查任务交接"), form])`;
const rows = [
  {
    id: 'R1',
    alternate: 'S1',
    title: '导出失败',
    status: '需核对',
    reason: '原始反馈一',
  },
  {
    id: 'R2',
    alternate: 'S2',
    title: '批量导出',
    status: '待确认',
    reason: '原始反馈二',
  },
];
async function action(
  request: APIRequestContext,
  id: string,
  name: string,
  fields: Record<string, unknown> = {},
) {
  const before = await request.get(`/api/items/${id}/workspace`);
  const ws = (await before.json()) as ItemWorkspace;
  const response = await request.post(`/api/items/${id}/workspace/actions`, {
    data: { action: name, baseRevision: ws.item.revision, ...fields },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as ItemWorkspace;
}
async function seed(request: APIRequestContext) {
  const response = await request.post('/api/items', {
    data: {
      title: 'OpenUI反馈闭环',
      goal: '整理反馈、补范围并检查实际处理过程',
      materials: ['用户报告导出失败', '用户希望批量导出'],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const item = await response.json();
  let ws = (await (
    await request.get(`/api/items/${item.id}/workspace`)
  ).json()) as ItemWorkspace;
  const definition: Definition = {
    schemaVersion: 1,
    inputs: ['materials', 'request'],
    inputContracts: {
      request: {
        required: false,
        item: {
          type: 'object',
          properties: {
            scope: { type: 'string', title: '适用范围', minLength: 1 },
            channel: { type: 'string', title: '渠道', enum: ['桌面', '网页'] },
            notes: { type: 'string', title: '备注', maxLength: 500 },
          },
          required: ['scope'],
          additionalProperties: false,
        },
      },
    },
    nodes: [
      {
        id: 'prepare',
        label: '整理反馈',
        kind: 'function',
        functionName: 'expression',
        operation: 'aggregate',
        expression: { kind: 'literal', value: rows },
      },
    ],
    edges: [{ from: ['$input', 'materials'], to: ['prepare', 'input'] }],
    outputs: { rows: ['prepare', 'output'] },
  };
  ws = await action(request, item.id, 'saveFlow', {
    definition,
    expectedDraftId: ws.work!.work.draftId,
  });
  ws = await action(request, item.id, 'selectInputs', {
    inputPort: 'materials',
    materialIds: ws.item.materials.map((m) => m.id),
  });
  ws = await action(request, item.id, 'saveUiProgram', {
    definitionId: ws.work!.work.draftId,
    source,
  });
  ws = await action(request, item.id, 'run');
  await expect
    .poll(async () => {
      ws = await (await request.get(`/api/items/${item.id}/workspace`)).json();
      return ws.work!.work.runs.at(-1)?.status;
    })
    .toBe('completed');
  ws = await action(request, item.id, 'publishDelivery', {
    runId: ws.work!.work.runs.at(-1)!.id,
    output: 'rows',
    programId: ws.uiProgram!.id,
  });
  return ws;
}

for (const width of [1440, 1024]) {
  test(`style contracts and controlled task focus ${width}`, async ({
    page,
    request,
  }, info) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const ws = await seed(request);
    await page.goto(`/items/${ws.item.id}?tab=results`);
    const ui = page.locator('[data-openui-renderer="official"]');
    await expect(ui).toBeVisible();
    const field = ui.locator('.form-field,.field').filter({
      has: page.getByRole('textbox', { name: '适用范围', exact: true }),
    });
    await expect
      .poll(() => field.evaluate((el) => getComputedStyle(el).marginBottom))
      .toBe('0px');
    const text = ui.getByRole('textbox', { name: '适用范围', exact: true });
    const select = ui.getByRole('combobox', { name: '渠道', exact: true });
    await expect
      .poll(async () =>
        Math.abs(
          (await text.boundingBox())!.height -
            (await select.boundingBox())!.height,
        ),
      )
      .toBeLessThan(1);
    await expect
      .poll(async () =>
        Math.abs(
          (await text.boundingBox())!.width -
            (await select.boundingBox())!.width,
        ),
      )
      .toBeLessThan(2);
    await expect(text).toHaveCSS('font-size', '13px');
    const opener = ui.getByRole('button', {
      name: '补充当前记录',
      exact: true,
    });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: '补充任务', exact: true });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole('textbox', { name: '适用范围', exact: true })
      .fill('任务内未提交的值');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    expect(await text.inputValue()).toBe('任务内未提交的值');
    await opener.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(opener).toBeFocused();
    await page
      .locator('.composition-workspace .main-content > [role=tabpanel]:visible')
      .evaluate((el) => {
        el.scrollTop = 0;
      });
    await page.evaluate(() => document.fonts.ready);
    await expect(ui.locator('.declared-input-form').first()).toHaveScreenshot(
      `work-surface-${width}.png`,
      {
        animations: 'disabled',
      },
    );
    await opener.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot(`task-dialog-${width}.png`, {
      animations: 'disabled',
    });
    await page.screenshot({ path: info.outputPath(`workspace-${width}.png`) });
  });
}
test('resizing preserves action reachability and user panel preference', async ({
  page,
  request,
}) => {
  const ws = await seed(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/items/${ws.item.id}?tab=results`);
  await expect(page.locator('[data-openui-renderer="official"]')).toBeVisible();
  const save = page
    .locator('[data-openui-renderer="official"]')
    .getByRole('button', { name: '保存输入', exact: true });
  const hit = () =>
    save.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      );
    });
  await expect.poll(hit).toBe(true);
  await page.setViewportSize({ width: 1024, height: 768 });
  await save.scrollIntoViewIfNeeded();
  await expect.poll(hit).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(hit).toBe(true);
  await expect(page.locator('.context-panel[data-mode="side"]')).toBeVisible();
});
