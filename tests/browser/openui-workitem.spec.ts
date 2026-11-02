import { test, expect, type APIRequestContext } from './fixtures';
import type { Definition } from '../../src/shared/records';
import type { ItemWorkspace } from '../../src/shared/workitem-composition';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const source = `root = Workspace("反馈处理", [records, form])
$selected = []
$draft = {}
records = Records("rows", "处理清单", "id", [Field("id", "编号"), Field("title", "反馈"), Field("status", "状态")], $selected, [next], [Field("title", "反馈内容"), Field("reason", "依据")])
next = ActionButton("继续所选记录", @Run(continueStep))
continueStep = Mutation("continue_records", {output: "rows", recordIds: $selected, inputPort: "materials"})
form = InputForm("request", "补充范围", $draft, save)
save = ActionButton("保存输入", @Run(saveInput))
saveInput = Mutation("submit_input", {inputPort: "request", value: $draft})`;
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
for (const size of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
])
  test(`official OpenUI records, native mutation, source edits and fixed process ${size.width}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(size);
    let ws = await seed(request);
    const id = ws.item.id;
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`/items/${id}?tab=results`);
    await expect(
      page.locator('[data-openui-renderer="official"]'),
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: '反馈', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('checkbox', { name: '选择记录 R2', exact: true })
      .check();
    await expect(page.getByText('1 条已选', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: '查看记录 R2', exact: true })
      .click();
    await expect(
      page.getByRole('dialog').getByText('原始反馈二', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '关闭', exact: true })
      .click();
    let failOnce = true;
    await page.route(`**/api/items/${id}/workspace/actions`, async (route) => {
      const body = route.request().postDataJSON();
      if (failOnce && body.action === 'addInput') {
        failOnce = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: '显式测试：首次保存失败' }),
        });
        return;
      }
      await route.continue();
    });
    await page
      .getByRole('textbox', { name: '适用范围', exact: true })
      .fill('桌面客户端');
    await page.getByRole('button', { name: '保存输入', exact: true }).click();
    await expect(page.getByText(/首次保存失败/).first()).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: '适用范围', exact: true }),
    ).toHaveValue('桌面客户端');
    await page.getByRole('button', { name: '保存输入', exact: true }).click();
    await expect
      .poll(async () => {
        const current = (await (
          await request.get(`/api/items/${id}/workspace`)
        ).json()) as ItemWorkspace;
        return current.item.receivedInputs?.at(-1)?.value;
      })
      .toEqual({ scope: '桌面客户端' });
    await page.unroute(`**/api/items/${id}/workspace/actions`);
    ws = await (await request.get(`/api/items/${id}/workspace`)).json();
    ws = await action(request, id, 'saveUiProgram', {
      definitionId: ws.work!.work.draftId,
      expectedProgramId: ws.uiProgram!.id,
      patch:
        'records = Records("rows", "当前处理清单", "id", [Field("id", "业务编号"), Field("title", "反馈"), Field("status", "状态")], $selected, [next], [Field("title", "反馈内容"), Field("reason", "依据")])',
    });
    await expect(
      page.getByRole('columnheader', { name: '业务编号', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: '选择记录 R2', exact: true }),
    ).toBeChecked();
    const runCount = ws.work!.work.runs.length;
    await page
      .getByRole('button', { name: '继续所选记录', exact: true })
      .click();
    await expect
      .poll(async () => {
        const current = (await (
          await request.get(`/api/items/${id}/workspace`)
        ).json()) as ItemWorkspace;
        return current.item.receivedInputs?.at(-1)?.value;
      })
      .toMatchObject(rows[1]);
    ws = await (await request.get(`/api/items/${id}/workspace`)).json();
    expect(ws.work!.work.runs).toHaveLength(runCount);
    await page
      .getByRole('textbox', { name: '适用范围', exact: true })
      .fill('保留但过期的输入');
    const baseline = ws.item.revision;
    await action(request, id, 'addInput', {
      inputPort: 'request',
      label: '另一会话',
      value: { scope: '外部新输入' },
    });
    await expect(
      page.getByText('工作项已变化，当前输入仍基于编辑开始时的版本。'),
    ).toBeVisible();
    const submitted = page.waitForRequest(
      (r) =>
        r.url().endsWith('/workspace/actions') &&
        r.postDataJSON()?.action === 'addInput',
    );
    await page.getByRole('button', { name: '保存输入', exact: true }).click();
    expect((await submitted).postDataJSON().baseRevision).toBe(baseline);
    await expect(
      page.getByRole('textbox', { name: '适用范围', exact: true }),
    ).toHaveValue('保留但过期的输入');
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /变化|修订|版本/ })
        .first(),
    ).toBeVisible();
    await page
      .getByRole('button', { name: '保留内容，使用当前版本', exact: true })
      .click();
    await page.getByRole('button', { name: '保存输入', exact: true }).click();
    await expect
      .poll(async () => {
        const latest = await (
          await request.get(`/api/items/${id}/workspace`)
        ).json();
        return latest.item.receivedInputs.at(-1).value;
      })
      .toEqual({ scope: '保留但过期的输入' });
    ws = await (await request.get(`/api/items/${id}/workspace`)).json();
    await action(request, id, 'publishDelivery', {
      runId: ws.work!.work.runs.at(-1)!.id,
      output: 'rows',
      programId: ws.uiProgram!.id,
    });
    await expect(
      page.getByRole('checkbox', { name: '选择记录 R2', exact: true }),
    ).not.toBeChecked();
    await page.getByRole('tab', { name: '流程', exact: true }).click();
    await expect(
      page.getByRole('region', { name: '处理过程', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: '处理过程', exact: true })
        .getByText('整理反馈', { exact: true })
        .first(),
    ).toBeVisible();
    const evidence =
      process.env.FLOWCRAFT_EVIDENCE_DIR || 'test-results/openui-evidence';
    await mkdir(evidence, { recursive: true });
    await page.screenshot({
      path: join(evidence, `process-${size.width}.png`),
      fullPage: false,
    });
    await page.getByRole('tab', { name: '工作', exact: true }).click();
    await page.screenshot({
      path: join(evidence, `records-${size.width}.png`),
      fullPage: false,
    });
    expect(pageErrors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  });

test('首页读取暂时失败后恢复，不保留读取错误', async ({ page }) => {
  let failures = 2;
  await page.route('**/api/items?*', async (route) => {
    if (failures-- > 0)
      return route.fulfill({
        status: 502,
        contentType: 'text/plain',
        body: '临时反向代理错误',
      });
    return route.continue();
  });
  await page.goto('/');
  await expect(
    page.getByRole('alert').filter({ hasText: '读取失败' }),
  ).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: '读取失败' }),
  ).toHaveCount(0, { timeout: 10000 });
});

test('历史OpenUI预览重挂载只读，Query误用写工具不产生业务请求', async ({
  page,
  request,
  application,
}) => {
  const ws = await seed(request);
  const preview = {
    ...ws.uiProgram!,
    id: 'historical-preview',
    source:
      'root = Workspace("历史预览", [TextContent("只读历史界面"), button])\nbutton = ActionButton("历史执行动作", @Run(write))\nwrite = Mutation("execute", {})\nmisuse = Query("execute", {}, {})',
  };
  await application.files.change(ws.item.workId!, (work) => {
    work.messages.push({
      id: 'preview-message',
      role: 'assistant',
      text: '历史界面样本',
      conversationId: 'main',
      status: 'completed',
      activities: [
        {
          id: 'saved-ui',
          toolCallId: 'saved-ui',
          toolName: 'save_ui_program',
          status: 'completed',
          result: { details: { uiProgram: preview } },
        },
      ],
    });
  });
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/workspace/actions'))
      writes.push(r.postData() || '');
  });
  await page.goto(`/items/${ws.item.id}?tab=results`);
  const previewRegion = page.locator('.assistant-openui-preview');
  await previewRegion.locator('summary').click();
  await expect(
    previewRegion.getByText('只读历史界面', { exact: true }),
  ).toBeVisible();
  await expect(
    previewRegion.getByRole('button', { name: '历史执行动作', exact: true }),
  ).toBeDisabled();
  await previewRegion.locator('summary').click();
  await previewRegion.locator('summary').click();
  await expect(
    previewRegion.getByRole('button', { name: '历史执行动作', exact: true }),
  ).toBeDisabled();
  await expect
    .poll(async () => {
      const current = await (
        await request.get(`/api/items/${ws.item.id}/workspace`)
      ).json();
      return current.work.work.runs.length;
    })
    .toBe(1);
  expect(writes).toEqual([]);
});

for (const width of [1440, 1024])
  test(`OpenUI保存回执保留发送之后的编辑并推进新保存基线 ${width}`, async ({
    page,
    request,
  }) => {
    const ws = await seed(request);
    let release!: () => void, captured!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const arrived = new Promise<void>((resolve) => {
      captured = resolve;
    });
    let hold = true;
    await page.route(
      `**/api/items/${ws.item.id}/workspace/actions`,
      async (route) => {
        if (!hold || route.request().postDataJSON().action !== 'saveUiProgram')
          return route.continue();
        hold = false;
        const response = await route.fetch();
        captured();
        await held;
        await route.fulfill({ response });
      },
    );
    try {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
      await page.goto(`/items/${ws.item.id}?tab=results`);
      await page.getByRole('button', { name: '工作项更多操作' }).click();
      await page
        .getByRole('menuitem', { name: '界面安排', exact: true })
        .click();
      const editor = page.getByRole('textbox', {
        name: 'OpenUI 描述',
        exact: true,
      });
      const first = source.replace('处理清单', '已提交的清单');
      const later = source.replace('处理清单', '回执之后仍需保存的清单');
      await editor.fill(first);
      const evidence =
        process.env.FLOWCRAFT_EVIDENCE_DIR || 'test-results/openui-evidence';
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: join(evidence, `editor-${width}.png`) });
      await page.getByRole('button', { name: '保存安排', exact: true }).click();
      await arrived;
      await editor.fill(later);
      release();
      await expect(editor).toHaveValue(later);
      await expect(page.getByText('未保存修改', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: '保存安排', exact: true }),
      ).toBeEnabled();
      await page.getByRole('button', { name: '保存安排', exact: true }).click();
      await expect
        .poll(async () => {
          const current = await (
            await request.get(`/api/items/${ws.item.id}/workspace`)
          ).json();
          return current.uiProgram.source;
        })
        .toBe(later);
      await expect(page.getByText('未保存修改', { exact: true })).toHaveCount(
        0,
      );
    } finally {
      release();
    }
  });
