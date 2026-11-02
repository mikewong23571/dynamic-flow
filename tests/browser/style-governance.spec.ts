import { execFileSync } from 'node:child_process';
import { test, expect, type APIRequestContext } from './fixtures';
import type { Definition } from '../../src/shared/records';
import type { ItemWorkspace } from '../../src/shared/workitem-composition';

const source = `root = Workspace("反馈处理", [records, form, opener, editor])
$selected = []
$draft = {}
records = Records("rows", "处理清单", "id", [Field("id", "编号"), Field("title", "反馈"), Field("status", "状态")], $selected, [next], [Field("title", "反馈内容"), Field("reason", "依据")])
next = ActionButton("继续所选记录", @Run(continueStep))
continueStep = Mutation("continue_records", {output: "rows", recordIds: $selected, inputPort: "materials"})
form = InputForm("request", "补充范围", $draft, save)
save = ActionButton("保存输入", Action([@Run(saveInput), @Set($editing, false)]))
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
    data: {
      action: name,
      baseRevision: ws.item.revision,
      ...(name === 'saveUiProgram'
        ? { expectedProgramId: ws.uiProgram?.id }
        : {}),
      ...fields,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as ItemWorkspace;
}
async function seed(request: APIRequestContext, program = source) {
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
    source: program,
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
    await expect(text).toHaveCSS('font-weight', '400');
    await expect(select).toHaveCSS('font-weight', '400');
    await expect(
      ui.getByRole('textbox', { name: '备注', exact: true }),
    ).toHaveCSS('font-weight', '400');
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

for (const width of [1440, 1024]) {
  test(`task success and missing trigger return focus ${width}`, async ({
    page,
    request,
  }) => {
    const ws = await seed(request);
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    await page.goto(`/items/${ws.item.id}?tab=results`);
    const opener = page.getByRole('button', {
      name: '补充当前记录',
      exact: true,
    });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: '补充任务', exact: true });
    await dialog
      .getByRole('textbox', { name: '适用范围', exact: true })
      .fill('提交后的焦点交接');
    await dialog.getByRole('button', { name: '保存输入', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(dialog).toBeVisible();
    await action(request, ws.item.id, 'saveUiProgram', {
      definitionId: ws.work!.work.draftId,
      source: source.replace(
        '[records, form, opener, editor]',
        '[records, form, editor]',
      ),
    });
    await expect(
      page.getByRole('button', {
        name: '补充当前记录',
        exact: true,
        includeHidden: true,
      }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(
      page.locator('.workspace-header h1').filter({ visible: true }),
    ).toBeFocused();
  });
}
test('saved panel width and manual method panel remain reachable on resize', async ({
  page,
  request,
}) => {
  const ws = await seed(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/methods/${ws.item.workId}`);
  await page.evaluate(() =>
    localStorage.setItem('dynamic-flow.panel-width', '560'),
  );
  await page.reload();
  await expect(page.locator('.context-panel[data-mode="side"]')).toHaveCSS(
    'width',
    '560px',
  );
  await page.getByRole('button', { name: '步骤配置', exact: true }).click();
  await page.locator('.react-flow__node[data-id="prepare"]').click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('.context-panel[data-mode="dock"]')).toBeVisible();
  const title = page.getByRole('textbox').filter({ visible: true }).first();
  await expect(title).toBeVisible();
  const run = page.getByRole('button', { name: '直接输入运行', exact: true });
  const hit = () =>
    run.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      );
    });
  await expect.poll(hit).toBe(true);
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  await expect(page.locator('.context-panel')).toBeHidden();
  await page.getByRole('button', { name: '打开侧栏', exact: true }).click();
  await expect(page.locator('.context-panel[data-mode="dock"]')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.context-panel[data-mode="side"]')).toHaveCSS(
    'width',
    '560px',
  );
});

test('public control state matrix and explicit compact sizing', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/')).text();
  const css = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)?.[1];
  expect(css).toBeTruthy();
  const matrix = execFileSync(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      '--tsconfig',
      'tsconfig.app.json',
      'tests/browser/control-matrix.tsx',
    ],
    { encoding: 'utf8' },
  );
  await page.route('**/ui-control-matrix', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><link rel="stylesheet" href="${css}"><style>.control-matrix{width:900px;max-width:calc(100vw - 48px);margin:24px;padding:24px;display:flex;flex-direction:column;gap:16px;background:var(--paper)}.control-matrix h1{font-size:18px}.matrix-row{display:flex;align-items:center;gap:8px}.matrix-row input{width:180px}</style></head><body>${matrix}</body></html>`,
    }),
  );
  await page.goto('/ui-control-matrix');
  for (const label of ['紧凑动作', '紧凑输入', '紧凑选择']) {
    const element = page.getByRole(
      label === '紧凑动作'
        ? 'button'
        : label === '紧凑输入'
          ? 'textbox'
          : 'combobox',
      { name: label, exact: true },
    );
    await expect(element).toHaveCSS('height', '28px');
  }
  for (const label of ['普通文本', '需修正的文本', '整组禁用'])
    await expect(
      page.getByRole('textbox', { name: label, exact: true }),
    ).toHaveCSS('font-weight', '400');
  await expect(
    page.getByRole('textbox', { name: '整组禁用', exact: true }),
  ).toBeDisabled();
  const normalBounds = (await page
    .getByRole('textbox', { name: '普通文本', exact: true })
    .boundingBox())!;
  const groupBounds = (await page
    .getByRole('textbox', { name: '整组禁用', exact: true })
    .boundingBox())!;
  expect(Math.abs(normalBounds.x - groupBounds.x)).toBeLessThan(1);
  expect(Math.abs(normalBounds.width - groupBounds.width)).toBeLessThan(1);
  await expect(
    page.getByRole('combobox', { name: '禁用选择', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '不可用动作', exact: true }),
  ).toBeDisabled();
  await page.getByRole('textbox', { name: '普通文本', exact: true }).focus();
  await expect(
    page.getByRole('textbox', { name: '普通文本', exact: true }),
  ).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.control-matrix')).toHaveScreenshot(
    'control-state-matrix.png',
    { animations: 'disabled' },
  );
});
test('home long request remains readable and retains local input', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  const goal = page.getByRole('textbox', { name: '工作需求', exact: true });
  const text = '需要持续处理的业务目标与材料\n'.repeat(50);
  await goal.fill(text);
  await expect(goal).toHaveValue(text);
  expect(await goal.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await goal.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await goal.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(
    page.getByRole('button', { name: '开始', exact: true }),
  ).toBeVisible();
});

for (const width of [1440, 1024])
  test(`dedicated material reader keeps width and returns to source ${width}`, async ({
    page,
    request,
  }) => {
    const ws = await seed(request);
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    await page.goto(`/items/${ws.item.id}?tab=inputs`);
    const trigger = page.getByRole('button', {
      name: '用户报告导出失败',
      exact: true,
    });
    await trigger.click();
    const reader = page.locator('.material-reader');
    await expect(reader).toBeVisible();
    await expect(reader).toHaveCSS('width', '960px');
    await reader.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(reader).toBeHidden();
    await expect(trigger).toBeFocused();
  });

test('retained material task portals follow tab and page visibility', async ({
  page,
  request,
}) => {
  const ws = await seed(request);
  await page.goto('/items');
  await page
    .getByRole('link', { name: `打开工作项 ${ws.item.key}`, exact: true })
    .click();
  await page.getByRole('tab', { name: '工作', exact: true }).click();
  await page.getByRole('tab', { name: '流程', exact: true }).click();
  await page.getByRole('tab', { name: '输入', exact: true }).click();
  const trigger = page.getByRole('button', {
    name: '用户报告导出失败',
    exact: true,
  });
  await trigger.click();
  await expect(page.locator('.material-reader')).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole('tab', { name: '流程', exact: true, includeHidden: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0);
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/items$/);
  expect(
    await page.evaluate(() => !document.activeElement?.closest('[hidden]')),
  ).toBe(true);
  await expect(
    page.getByRole('heading', { name: '工作项', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goForward();
  await page.goForward();
  await page.goForward();
  await expect(
    page.getByRole('tab', { name: '输入', exact: true, includeHidden: true }),
  ).toHaveAttribute('aria-selected', 'true');
  // A pure reader may close at a retained-page boundary; its original object must remain reachable.
  if (!(await page.locator('.material-reader').isVisible()))
    await trigger.click();
  await expect(page.locator('.material-reader')).toBeVisible();
  await page
    .locator('.material-reader')
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  await expect(trigger).toBeFocused();
});

for (const width of [1440, 1024])
  test(`settings provider fields and cancellation remain usable ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    await page.goto('/');
    await page.locator('.model-settings-button').click();
    const dialog = page.getByRole('dialog', { name: '模型设置', exact: true });
    await dialog
      .getByRole('button', { name: '新增 Provider', exact: true })
      .click();
    const name = dialog.getByRole('textbox', {
      name: 'Provider 名称',
      exact: true,
    });
    const protocol = dialog.getByRole('combobox', {
      name: '协议类型',
      exact: true,
    });
    await expect(name).toHaveCSS('height', '32px');
    await expect(protocol).toHaveCSS('height', '32px');
    await expect(name).toHaveCSS('font-weight', '400');
    await expect(protocol).toHaveCSS('font-weight', '400');
    await name.fill('style-preview');
    await dialog
      .getByRole('textbox', { name: '服务地址', exact: true })
      .fill('https://example.invalid/v1');
    await dialog
      .getByRole('textbox', { name: 'API 密钥', exact: true })
      .fill('placeholder-only');
    await page.screenshot({
      path: info.outputPath(`provider-fields-${width}.png`),
    });
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await dialog
      .getByRole('button', { name: '新增 Provider', exact: true })
      .click();
    await expect(
      dialog.getByRole('textbox', { name: 'API 密钥', exact: true }),
    ).toHaveValue('');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(dialog).toBeHidden();
  });

test('closing a busy task uses the task anchor instead of a disabled trigger', async ({
  page,
  request,
}) => {
  const ws = await seed(request);
  await page.goto(`/items/${ws.item.id}?tab=results`);
  const trigger = page.getByRole('button', {
    name: '补充当前记录',
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '补充任务', exact: true });
  await dialog
    .getByRole('textbox', { name: '适用范围', exact: true })
    .fill('正在提交的输入');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    `**/api/items/${ws.item.id}/workspace/actions`,
    async (route) => {
      if (route.request().postDataJSON().action === 'addInput') await gate;
      await route.continue();
    },
  );
  try {
    await dialog.getByRole('button', { name: '保存输入', exact: true }).click();
    await expect(
      page.getByRole('button', {
        name: '补充当前记录',
        exact: true,
        includeHidden: true,
      }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(
      page.locator('.workspace-header h1').filter({ visible: true }),
    ).toBeFocused();
  } finally {
    release();
  }
});
