import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openuiContract,
  parseOpenUIProgram,
  mergeOpenUIProgram,
} from '../src/shared/openui';

const source = `root = Workspace("事项处理", [records, form])
$selected = []
$draft = {}
records = Records("rows", "处理清单", "id", [Field("id", "编号"), Field("title", "事项")], $selected, [continueButton])
continueButton = ActionButton("继续所选", @Run(next))
next = Mutation("continue_records", {output: "rows", recordIds: $selected})
form = InputForm("request", "补充输入", $draft, submit)
submit = ActionButton("保存输入", @Run(save))
save = Mutation("submit_input", {inputPort: "request", value: $draft})`;

test('native OpenUI library produces the prompt/schema and derives frozen record identity from saved source', () => {
  const parsed = parseOpenUIProgram(source);
  assert.equal(parsed.root.typeName, 'Workspace');
  assert.equal(parsed.records[0].rowKey, 'id');
  assert.deepEqual(parsed.records[0].columns, [
    { field: 'id', label: '编号' },
    { field: 'title', label: '事项' },
  ]);
  assert.deepEqual(parsed.outputs, ['rows']);
  assert.equal(parsed.mutations.length, 2);
  assert.ok(openuiContract.prompt().includes('Records'));
  assert.ok(openuiContract.toJSONSchema());
});

test('saved native programs reject incomplete components, unknown references, and Query writes', () => {
  for (const invalid of [
    'root = Workspace("未完成", [Records(',
    'root = Workspace("缺引用", [missing])',
    'root = Workspace("未知组件", [Invisible("x")])',
    'root = Workspace("错误读取", [TextContent("x")])\nwrite = Query("execute", {}, {})',
    'root = Workspace("错误写入", [])\nwrite = Mutation("arbitrary_http", {})',
  ])
    assert.throws(
      () => parseOpenUIProgram(invalid),
      (error) => (error as { code: string }).code === 'UI_PROGRAM_INVALID',
    );
});

test('native named merge changes one statement, preserves mutations and binding variables', () => {
  const next = mergeOpenUIProgram(
    source,
    'records = Records("rows", "当前处理清单", "id", [Field("id", "业务编号"), Field("title", "事项")], $selected, [continueButton])',
  );
  const parsed = parseOpenUIProgram(next);
  assert.equal(parsed.records[0].title, '当前处理清单');
  assert.equal(parsed.records[0].columns[0].label, '业务编号');
  assert.equal(parsed.mutations.length, 2);
  assert.ok(parsed.statements.includes('$draft'));
  assert.ok(parsed.statements.includes('form'));
});

test('business observation is independent of delivery and requires live reads rather than a saved status snapshot', () => {
  const live = `root = Workspace("业务推进", [counts, current, rows])
children = Query("read_children", {scope: "children"}, {items: [], scopeSummary: {completed: null}}, 2)
state = Query("read_workspace", {}, {item: {}}, 2)
counts = Metric("已处理", children.scopeSummary.completed)
current = Details("本项进展", state.item, [Field("stage", "当前环节")])
rows = DataTable("处理对象", children.items, "id", [Field("title", "对象")])`;
  const parsed = parseOpenUIProgram(live);
  assert.deepEqual(parsed.outputs, []);
  assert.equal(parsed.queries.length, 2);
  assert.throws(
    () => parseOpenUIProgram(live.replace('}, 2)', '})')),
    /刷新间隔/,
  );
  assert.throws(
    () => parseOpenUIProgram(live.replace('read_children', 'made_up_read')),
    /读取工具/,
  );
});

test('native composition supports per-record contextual actions without adding business pages', () => {
  const source = `root = Workspace("事项", [items, editor])
data = Query("read_inputs", {inputPort: "items"}, {rows: []}, 2)
$draft = {}
$editing = false
items = @Each(data.rows, "row", Section(row.id, [Stack([TextContent(row.title), ActionButton("补充", Action([@Set($draft, {id: row.id}), @Set($editing, true)]), "secondary")], "horizontal"), Disclosure("资料", [Details("", row, [Field("title", "内容")])])]))
editor = Dialog("补充说明", $editing, [form])
form = InputForm("supplement", "", $draft, save)
save = ActionButton("保存", Action([@Run(submit), @Set($editing, false)]), "primary")
submit = Mutation("submit_input", {inputPort: "supplement", value: $draft})`;
  const parsed = parseOpenUIProgram(source);
  assert.deepEqual(
    parsed.inputs.map((form) => form.inputPort),
    ['supplement'],
  );
  assert.equal(parsed.mutations.length, 1);
  assert.deepEqual(parsed.outputs, []);
});
