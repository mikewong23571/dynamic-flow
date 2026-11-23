import { test, expect } from './fixtures';
import type { Definition } from '../../src/shared/records';

const definition: Definition = {
  schemaVersion: 1,
  inputs: ['items', 'supplement'],
  inputContracts: {
    supplement: {
      required: false,
      item: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          note: { type: 'string', title: '补充说明' },
        },
        required: ['id', 'note'],
      },
    },
  },
  nodes: [
    {
      id: 'copy',
      label: '整理内容',
      kind: 'function',
      operation: 'map',
      functionName: 'identity',
    },
  ],
  edges: [{ from: ['$input', 'items'], to: ['copy', 'input'] }],
  outputs: { rows: ['copy', 'output'] },
};
const source = `root = Workspace("记录处理", [header, items, more, editor])
state = Query("read_workspace", {}, {item: {}}, 1)
data = Query("read_inputs", {inputPort: "items"}, {rows: []}, 1)
result = Query("read_output", {output: "rows"}, {run: null, rows: []}, 1)
$draft = {}
$editing = false
header = Stack([TextContent("逐项查看内容并补充说明"), start], "horizontal")
start = ActionButton("处理这些内容", @Run(execute), "primary", state.item.execution.status == "running")
execute = Mutation("execute", {})
items = @Each(data.rows, "row", Section(row.title, [Stack([TextContent(row.note), ActionButton("补充说明", Action([@Set($draft, {id: row.id}), @Set($editing, true)]), "secondary")], "horizontal")]))
more = Disclosure("查看本次处理内容", [DataTable("", result.rows, "id", [Field("title", "内容"), Field("note", "说明")])])
editor = Dialog("补充当前记录", $editing, [form])
form = InputForm("supplement", "", $draft, save, null, null, ["note"])
save = ActionButton("保存说明", Action([@Run(submit), @Set($editing, false), @Reset($draft)]), "primary")
submit = Mutation("submit_input", {inputPort: "supplement", value: $draft})`;

for (const width of [1440, 1024]) {
  test(`组合和逐项动作使用原生状态及真实命令 ${width}`, async ({
    page,
    application,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    const item = await application.items.create({
      title: '待办材料',
      goal: '整理内容并补充说明',
      materials: [],
    });
    let ws = await application.composition.snapshot(item.id);
    ws = await application.composition.saveFlow(
      item.id,
      ws.item.revision,
      definition,
      ws.work!.work.draftId,
    );
    for (const value of [
      { id: 'A', title: '第一项', note: '已有说明' },
      { id: 'B', title: '第二项', note: '待补说明' },
    ])
      ws = await application.composition.addInput(
        item.id,
        ws.item.revision,
        'items',
        value.title,
        value,
      );
    ws = await application.composition.saveUiProgram(
      item.id,
      ws.item.revision,
      { definitionId: ws.work!.work.draftId, source },
    );
    const programId = ws.uiProgram!.id;
    await page.goto(`/items/${item.id}`);
    const ui = page.locator('[data-openui-renderer="official"]');
    await expect(
      ui.getByRole('heading', { name: '第二项', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '执行当前方案', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '界面安排', exact: true }),
    ).toHaveCount(0);
    const second = ui.locator('section').filter({
      has: page.getByRole('heading', { name: '第二项', exact: true }),
    });
    await second.getByRole('button', { name: '补充说明', exact: true }).click();
    const dialog = page.getByRole('dialog', {
      name: '补充当前记录',
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveCount(1);
    await dialog
      .getByRole('textbox', { name: '补充说明', exact: true })
      .fill('第二项的新说明');
    let failOnce = true;
    await page.route(
      `**/api/items/${item.id}/workspace/actions`,
      async (route) => {
        if (failOnce && route.request().postDataJSON().action === 'addInput') {
          failOnce = false;
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: '本次保存失败，请重试' }),
          });
        } else await route.continue();
      },
    );
    await dialog.getByRole('button', { name: '保存说明', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('本次保存失败');
    await expect(
      dialog.getByRole('textbox', { name: '补充说明', exact: true }),
    ).toHaveValue('第二项的新说明');
    await dialog.getByRole('button', { name: '保存说明', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect
      .poll(
        async () =>
          (await application.items.get(item.id)).receivedInputs?.at(-1)?.value,
      )
      .toEqual({ id: 'B', note: '第二项的新说明' });
    expect((await application.files.read(item.workId)).runs).toHaveLength(0);
    await ui.getByRole('button', { name: '处理这些内容', exact: true }).click();
    await expect
      .poll(
        async () => (await application.items.get(item.id)).execution?.status,
      )
      .toBe('completed');
    await ui.getByText('查看本次处理内容', { exact: true }).click();
    await expect(
      ui.getByRole('cell', { name: '第二项', exact: true }),
    ).toBeVisible();
    await expect(ui.getByRole('checkbox')).toHaveCount(0);
    await expect(ui.getByRole('textbox', { name: '搜索成果记录' })).toHaveCount(
      0,
    );
    expect((await application.items.get(item.id)).deliveries).toHaveLength(0);
    expect(
      (await application.composition.snapshot(item.id)).uiProgram!.id,
    ).toBe(programId);
    expect((await application.items.get(item.id)).status).toBe('open');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
