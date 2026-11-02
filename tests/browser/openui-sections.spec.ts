import { test, expect } from './fixtures';
import type { Definition } from '../../src/shared/records';

const definition: Definition = {
  schemaVersion: 1,
  inputs: ['items', 'request'],
  inputContracts: {
    request: {
      required: false,
      item: {
        type: 'object',
        properties: {
          scope: { type: 'string', title: '适用范围', minLength: 1 },
        },
        required: ['scope'],
      },
    },
  },
  nodes: [
    {
      id: 'copy',
      label: '整理材料',
      kind: 'function',
      operation: 'map',
      functionName: 'identity',
    },
  ],
  edges: [{ from: ['$input', 'items'], to: ['copy', 'input'] }],
  outputs: { rows: ['copy', 'output'] },
};
const source = `root = Workspace("业务分组", [handling, supplement, plain])
data = Query("read_inputs", {inputPort: "items"}, {rows: []}, 1)
$selected = []
$draft = {}
$editing = false
handling = Section("处理事项", [TextContent("核对实际材料，再填写本组适用范围。"), table, form, actions, editor])
table = DataTable("", data.rows, "id", [Field("id", "编号"), Field("title", "事项")], $selected)
form = InputForm("request", "", $draft, save)
save = ActionButton("保存范围", @Run(submit), "primary")
submit = Mutation("submit_input", {inputPort: "request", value: $draft})
actions = Stack([ActionButton("补充范围", @Set($editing, true), "secondary"), TextContent("本组动作与数据放在一起。")], "horizontal")
supplement = Section("补充资料", [TextContent("需要时查看依据。"), nested])
nested = Section("核对依据", [TextContent("原始材料提供核对依据。"), deep])
deep = Section("来源说明", [TextContent("所有材料均为独立测试的合成数据。")])
editor = Dialog("补充范围任务", $editing, [Section("任务范围", [form])])
plain = Stack([TextContent("纯布局内容"), TextContent("无自动业务分界")])`;

for (const width of [1440, 1024]) {
  test(`explicit business sections keep mixed content, nested headings and real actions ${width}`, async ({
    page,
    application,
  }, info) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const item = await application.items.create({
      title: '分组核对（合成样例）',
      goal: '核对分组、输入与任务交接',
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
      'items',
      '合成材料',
      { id: 'DEMO-01', title: '合成待核对事项' },
    );
    ws = await application.composition.saveUiProgram(
      item.id,
      ws.item.revision,
      { definitionId: ws.work!.work.draftId, source },
    );
    expect(ws.uiProgram!.source).toBe(source);
    await page.goto(`/items/${item.id}`);
    const ui = page.locator('[data-openui-renderer="official"]');
    const handling = ui.getByRole('region', { name: '处理事项', exact: true });
    const supplement = ui.getByRole('region', {
      name: '补充资料',
      exact: true,
    });
    await expect(handling).toBeVisible();
    await expect(
      handling.getByRole('heading', {
        name: '处理事项',
        level: 2,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      supplement.getByRole('heading', {
        name: '补充资料',
        level: 2,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      supplement.getByRole('heading', {
        name: '核对依据',
        level: 3,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      supplement.getByRole('heading', {
        name: '来源说明',
        level: 4,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      handling.getByText('合成待核对事项', { exact: true }),
    ).toBeVisible();
    await expect(
      handling.getByRole('textbox', { name: '适用范围', exact: true }),
    ).toBeVisible();
    await expect(
      handling.getByRole('button', { name: '补充范围', exact: true }),
    ).toBeVisible();
    await expect(handling).toHaveCSS('border-top-width', '1px');
    await expect(supplement).toHaveCSS('border-top-width', '1px');
    const plain = ui
      .locator('.openui-stack')
      .filter({ has: page.getByText('纯布局内容', { exact: true }) })
      .last();
    await expect(plain).toHaveCSS('border-top-width', '0px');
    await expect(plain).not.toHaveAttribute('aria-labelledby');
    expect(
      await ui.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`sections-${width}.png`) });
    await supplement
      .getByRole('heading', { name: '来源说明', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`sections-nested-${width}.png`),
    });
    const selected = handling.getByRole('checkbox', {
      name: '选择记录 DEMO-01',
      exact: true,
    });
    await selected.check();
    const opener = handling.getByRole('button', {
      name: '补充范围',
      exact: true,
    });
    await opener.click();
    const dialog = page.getByRole('dialog', {
      name: '补充范围任务',
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: '任务范围', level: 3, exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole('textbox', { name: '适用范围', exact: true })
      .fill('本次合成范围');
    await page.screenshot({
      path: info.outputPath(`section-task-${width}.png`),
    });
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await expect(
      handling.getByRole('textbox', { name: '适用范围', exact: true }),
    ).toHaveValue('本次合成范围');
    await handling
      .getByRole('button', { name: '保存范围', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await application.composition.snapshot(item.id)
          ).item.receivedInputs?.at(-1)?.value,
      )
      .toEqual({ scope: '本次合成范围' });
    await expect(selected).toBeChecked();
    ws = await application.composition.snapshot(item.id);
    const legacy = source
      .replace(
        '[handling, supplement, plain]',
        '[table, form, actions, editor, plain]',
      )
      .replace(
        'Dialog("补充范围任务", $editing, [Section("任务范围", [form])])',
        'Dialog("补充范围任务", $editing, [form])',
      )
      .split('\n')
      .filter((line) => !/^(handling|supplement|nested|deep) = /.test(line))
      .join('\n');
    expect(legacy).not.toContain('Section(');
    ws = await application.composition.saveUiProgram(
      item.id,
      ws.item.revision,
      {
        definitionId: ws.work!.work.draftId,
        expectedProgramId: ws.uiProgram!.id,
        source: legacy,
      },
    );
    await expect(ui.locator('.openui-section')).toHaveCount(0);
    await expect(ui.getByText('合成待核对事项', { exact: true })).toBeVisible();
    await expect(
      ui.getByRole('textbox', { name: '适用范围', exact: true }),
    ).toBeVisible();
    expect(ws.uiProgram!.source).toBe(legacy);
    const duplicateTitles = source.replace(
      '[handling, supplement, plain]',
      '[Section("", [Section("重复标题", [TextContent("第一组")]), Section("重复标题", [TextContent("第二组")])]), plain]',
    );
    ws = await application.composition.saveUiProgram(
      item.id,
      ws.item.revision,
      {
        definitionId: ws.work!.work.draftId,
        expectedProgramId: ws.uiProgram!.id,
        source: duplicateTitles,
      },
    );
    await expect(
      ui.getByRole('region', { name: '重复标题', exact: true }),
    ).toHaveCount(2);
    await expect(
      ui.getByRole('heading', { name: '重复标题', level: 2, exact: true }),
    ).toHaveCount(2);
    const references = await ui
      .locator('.openui-section[aria-labelledby]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('aria-labelledby')),
      );
    expect(new Set(references).size).toBe(2);
    expect(
      await ui
        .locator('.openui-section')
        .first()
        .getAttribute('aria-labelledby'),
    ).toBeNull();
  });
}
