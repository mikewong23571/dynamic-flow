import { z } from 'zod/v4';
import {
  action,
  createLibrary,
  createParser,
  defineComponent,
  markReactive,
  mergeStatements,
  split,
  tokenize,
  type ElementNode,
  type ASTNode,
} from '@openuidev/lang-core';

export interface OpenUIProgram {
  id: string;
  definitionId: string;
  source: string;
}
export interface OpenUIFocus {
  programId: string;
  block: string;
}
export interface OpenUIField {
  field: string;
  label: string;
}
export interface OpenUIInputForm {
  inputPort: string;
  output?: string;
  methodId?: string;
  methodDefinitionId?: string;
  fields?: string[];
}
export interface OpenUIRecordView {
  name: string;
  output: string;
  title: string;
  rowKey: string;
  columns: OpenUIField[];
  details?: OpenUIField[];
  groupBy?: string;
}
const binding = <T extends z.ZodType>(schema: T) => {
  markReactive(schema);
  return schema;
};
const field = defineComponent({
  name: 'Field',
  description: 'A real top-level record field and its business label.',
  props: z.object({ field: z.string().min(1), label: z.string().min(1) }),
  component: null,
});
const text = defineComponent({
  name: 'TextContent',
  description: 'Short explanatory text; never a replacement for real output.',
  props: z.object({ text: z.string() }),
  component: null,
});
const button = defineComponent({
  name: 'ActionButton',
  description:
    'User-triggered action. Mutation runs only through an explicit @Run action.',
  props: z.object({
    label: z.string().min(1),
    action: action().optional(),
    emphasis: z.enum(['primary', 'secondary', 'quiet']).optional(),
    disabled: z.boolean().optional(),
  }),
  component: null,
});
const records = defineComponent({
  name: 'Records',
  description:
    'Real published output records. Do not embed rows; the application reads this output from its fixed delivery. Bind selection to a $variable.',
  props: z.object({
    output: z.string().min(1),
    title: z.string(),
    rowKey: z.string().min(1),
    columns: z.array(field.ref).min(1),
    selection: binding(z.array(z.string()).optional()),
    actions: z.array(button.ref).optional(),
    details: z.array(field.ref).optional(),
    groupBy: z.string().optional(),
    searchable: z.boolean().optional(),
  }),
  component: null,
});
const report = defineComponent({
  name: 'Report',
  description:
    'Read the actual fixed output as a report; never embed fabricated business content.',
  props: z.object({
    output: z.string().min(1),
    title: z.string(),
    fields: z.array(field.ref).optional(),
  }),
  component: null,
});
const input = defineComponent({
  name: 'InputForm',
  description:
    'Edit the actual input contract for inputPort. Bind value to a $variable and submit it through Mutation("submit_input", {inputPort,value:$variable}).',
  props: z.object({
    inputPort: z.string().min(1),
    title: z.string(),
    value: binding(z.record(z.string(), z.unknown())),
    submit: button.ref,
    methodId: z.string().optional(),
    methodDefinitionId: z.string().optional(),
    fields: z.array(z.string()).optional(),
    output: z.string().optional(),
  }),
  component: null,
});
const details = defineComponent({
  name: 'Details',
  description:
    'Display selected real fields with business labels, in order. value comes from a live Query; this can describe the current item, a stage result or a decision needing user input.',
  props: z.object({
    title: z.string(),
    value: z.unknown(),
    fields: z.array(field.ref).min(1),
  }),
  component: null,
});
const metric = defineComponent({
  name: 'Metric',
  description:
    'One business-labelled number or short value read from a Query. Never embed a count or invent a business completion percentage.',
  props: z.object({
    label: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }),
  component: null,
});
const dataTable = defineComponent({
  name: 'DataTable',
  description:
    'Inspect live business rows from Query: child items or actual stage outputs before publication. Columns/details use business labels. Selection stores stable row IDs; actions can ask the Assistant about the selected rows. This observation does not publish or adopt results.',
  props: z.object({
    title: z.string(),
    rows: z.array(z.unknown()),
    rowKey: z.string().min(1),
    columns: z.array(field.ref).min(1),
    selection: binding(z.array(z.string()).optional()),
    actions: z.array(button.ref).optional(),
    details: z.array(field.ref).optional(),
    sources: z.array(z.unknown()).optional(),
    searchable: z.boolean().optional(),
  }),
  component: null,
});
const stack = defineComponent({
  name: 'Stack',
  description:
    'Layout only: compose content vertically or in a wrapping horizontal row. Stack never creates a business group, heading or visual boundary; use Section for an explicit business group.',
  props: z.object({
    children: z.array(z.unknown()),
    direction: z.enum(['vertical', 'horizontal']).optional(),
  }),
  component: null,
});
const disclosure = defineComponent({
  name: 'Disclosure',
  description:
    'Keep supporting content available on demand under an explicit label.',
  props: z.object({ title: z.string().min(1), children: z.array(z.unknown()) }),
  component: null,
});
const dialog = defineComponent({
  name: 'Dialog',
  description:
    'An on-demand task or detail using native local state. Bind open to $open; @Set($open,true) opens it. Children may include an InputForm using the same $draft prepared by the contextual action.',
  props: z.object({
    title: z.string().min(1),
    open: binding(z.boolean()),
    children: z.array(z.unknown()),
  }),
  component: null,
});
const section = defineComponent({
  name: 'Section',
  description:
    'An explicit business group with a shared heading and a light default boundary. Mix related tables, forms, text and group actions within the same Section. Nest Section for business subgroups; the renderer handles heading levels and accessible names without stacked cards. Children flow vertically; Stack only arranges content. Group names and contents come from the work, never from child component types.',
  props: z.object({ title: z.string(), children: z.array(z.unknown()) }),
  component: null,
});
const view = defineComponent({
  name: 'View',
  description:
    'One business view. The renderer spaces its top-level content blocks consistently; the title labels its navigation entry.',
  props: z.object({ title: z.string().min(1), children: z.array(z.unknown()) }),
  component: null,
});
const tabs = defineComponent({
  name: 'ViewNavigation',
  description:
    'Explicit tabs or select navigation for business views, with space separating navigation from view content.',
  props: z.object({
    navigation: z.enum(['tabs', 'select']),
    views: z.array(view.ref).min(1),
  }),
  component: null,
});
const workspace = defineComponent({
  name: 'Workspace',
  description:
    'The business workspace; the app provides identity, process inspection and navigation separately.',
  props: z.object({ title: z.string().min(1), children: z.array(z.unknown()) }),
  component: null,
});
export const openuiContract = createLibrary({
  id: 'flowcraft-workitem-v1',
  root: 'Workspace',
  components: [
    workspace,
    stack,
    disclosure,
    dialog,
    section,
    view,
    tabs,
    field,
    text,
    button,
    records,
    report,
    input,
    details,
    metric,
    dataTable,
  ],
});
export const openuiReadTools = [
  'read_workspace',
  'read_inputs',
  'read_children',
  'read_output',
  'read_delivery',
] as const;
export const openuiWriteTools = [
  'submit_input',
  'continue_records',
  'bind_inputs',
  'execute',
  'publish_delivery',
  'review',
] as const;
/**
 * Compact authoritative OpenUI Lang reference (~3.4 KB) for check_workspace / apply_workspace_plan.
 * Replaces the verbose ~27 KB generic SDK textbook while keeping 100% alignment with openuiContract.
 */
export const openuiInstructions = `OpenUI Lang Reference (ONLY for check_workspace.source and apply_workspace_plan.uiSource/uiPatch; never dump source in chat reply).

## Syntax
- Statements: \`name = Component(arg1, arg2, ...)\` (positional args; omit trailing optional args or pass \`null\`). Entry statement must be \`root = Workspace(title, children)\`.
- Reactive UI state: \`$var = initialValue\` (e.g. \`$selected = []\`, \`$draft = {}\`, \`$open = false\`). UI state only; never business truth.
- Actions: \`@Run(mutationRef)\`, \`@Set($var, expr)\`, \`@ToAssistant("prompt", optionalRef)\`, or sequence \`[@Set(...), @Run(...)]\`.
- Per-row inline template: \`@Each(rows, "row", Component(...))\` (loop var exists only inside that inline template).
- Queries (read-only, 4th arg = refresh interval in seconds, use \`2\`): \`q = Query("tool_name", {args}, fallbackDefault, 2)\`. Always use empty/null fallback defaults, never mock/fabricated data.
- Mutations (write-only, invoked ONLY via \`@Run(...)\`): \`m = Mutation("tool_name", {args})\`.
- Patching (\`uiPatch\`): submit only the changed/added named statements to merge into the saved program.

## Components (positional args)
- Workspace(title, children[])
- Section(title, children[])  // Explicit business group with heading & light boundary; nest for subgroups.
- Stack(children[], direction?: "vertical"|"horizontal")  // Layout only, no heading/boundary.
- ViewNavigation(navigation: "tabs"|"select", views: View[])
- View(title, children[])
- Disclosure(title, children[])
- Dialog(title, open: $bool, children[])
- Field(field, label)  // Top-level property name + business label.
- TextContent(text)  // Brief static guidance only; never copy changing status/counts/findings into literals.
- Metric(label, value: string|number|boolean|null)
- Details(title, value, fields: Field[])  // Selected object fields from live Query.
- DataTable(title, rows[], rowKey, columns: Field[], selection?: $ids, actions?: ActionButton[], details?: Field[], sources?: unknown[], searchable?: boolean)  // Live stage outputs or child items before publication.
- Records(output, title, rowKey, columns: Field[], selection?: $ids, actions?: ActionButton[], details?: Field[], groupBy?: string, searchable?: boolean)  // Published fixed Delivery rows; never embed rows.
- Report(output, title, fields?: Field[])  // Published fixed Delivery report.
- InputForm(inputPort, title, value: $obj, submit: ActionButton, methodId?, methodDefinitionId?, fields?: string[], output?)  // Renders real inputContracts fields; submit via Mutation("submit_input", {inputPort, value: $obj, label?}).
- ActionButton(label, action?, emphasis?: "primary"|"secondary"|"quiet", disabled?: boolean)

## Allowed Tools
- Query (read-only):
  - \`read_workspace({})\` -> \`{item, work, deliveries}\` (item has statusLabel/stage/summary/nextAction/blocker/effectiveStatus/criteria/execution)
  - \`read_inputs({inputPort, offset?, limit?})\` -> \`{definitionId, revision, rows, sources, total}\`
  - \`read_children({scope?: "children"|"descendants", status?, query?, page?, pageSize?})\` -> \`{items, total, summary, scopeSummary, todoTotal}\`
  - \`read_output({output?, nodeId?, port?, runId?, offset?, limit?})\` -> \`{run, rows, sources, total}\` (observes actual completed stage outputs even before publication)
  - \`read_delivery({output})\` -> fixed published delivery
- Mutation (explicit user action only):
  - \`submit_input({inputPort, value: $draft, label?})\`
  - \`continue_records({output, recordIds: $selected, inputPort?, methodId?, methodDefinitionId?, draft?: $draft, recordField?})\`
  - \`bind_inputs({inputBindings})\`, \`execute({})\`, \`publish_delivery({runId, output})\`, \`review({})\`

## Rules
- Choose views/fields/groupings for this specific work; empty \`title\` omits redundant inner heading inside a named Section.
- The shell header already shows item status; do not render a redundant status/stage Details card unless the flow tracks real milestone stage/blocker/nextAction. When displaying status in UI, use \`item.statusLabel\` (localized).
- DataTable/Records show checkboxes only when \`selection\` is bound; search only when \`searchable\` is \`true\`.
- Never fabricate counts/findings or treat generating UI as business completion.

## Examples
\`\`\`
root = Workspace("阶段观察", [sec])
sec = Section("核查输出", [tbl])
obs = Query("read_output", {output: "result"}, {rows: [], sources: []}, 2)
tbl = DataTable("", obs.rows, "id", [Field("id", "编号"), Field("status", "状态")])
\`\`\`
\`\`\`
root = Workspace("处理清单", [handling, supplement])
handling = Section("处理事项", [records])
supplement = Section("补充资料", [form])
$selected = []
$draft = {}
records = Records("records", "", "id", [Field("id", "编号"), Field("title", "事项")], $selected, [next])
next = ActionButton("继续所选记录", @Run(continueStep))
continueStep = Mutation("continue_records", {output: "records", recordIds: $selected})
form = InputForm("request", "", $draft, save)
save = ActionButton("保存输入", @Run(saveInput), "primary")
saveInput = Mutation("submit_input", {inputPort: "request", value: $draft})
\`\`\``;
const parser = createParser(openuiContract.toJSONSchema());
const problem = (message: string) =>
  Object.assign(Error(message), { code: 'UI_PROGRAM_INVALID' });
function isElement(value: unknown): value is ElementNode {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { type?: string }).type === 'element'
  );
}
function literalTool(ast: ASTNode | null) {
  return ast?.k === 'Str' ? ast.v : undefined;
}
function asFields(value: unknown): OpenUIField[] {
  return Array.isArray(value)
    ? value.map((entry) => {
        const props = isElement(entry)
          ? entry.props
          : (entry as Record<string, unknown>);
        return { field: String(props.field), label: String(props.label) };
      })
    : [];
}
/** SDK parsing is authoritative. This layer checks only complete saves and application references. */
export function parseOpenUIProgram(source: string) {
  if (typeof source !== 'string' || !source.trim())
    throw problem('请提供完整OpenUI程序。');
  const result = parser.parse(source);
  if (
    !result.root ||
    result.meta.incomplete ||
    result.meta.unresolved.length ||
    result.meta.errors.length
  )
    throw problem(
      result.meta.errors.map((e) => e.message).join('；') ||
        `界面程序尚未完整解析${result.meta.unresolved.length ? `：${result.meta.unresolved.join('、')}` : ''}。`,
    );
  for (const query of result.queryStatements) {
    const tool = literalTool(query.toolAST);
    if (
      !query.complete ||
      !openuiReadTools.includes(tool as (typeof openuiReadTools)[number])
    )
      throw problem(`Query只能调用读取工具：${tool || query.statementId}。`);
    if (
      !query.refreshAST ||
      query.refreshAST.k !== 'Num' ||
      !(query.refreshAST.v > 0)
    )
      throw problem(
        `实时读取 ${query.statementId} 需要正数刷新间隔（秒），例如 Query("${tool}", {}, {}, 2)。`,
      );
  }
  for (const mutation of result.mutationStatements) {
    const tool = literalTool(mutation.toolAST);
    if (!openuiWriteTools.includes(tool as (typeof openuiWriteTools)[number]))
      throw problem(`Mutation工具不可用：${tool || mutation.statementId}。`);
  }
  const records: OpenUIRecordView[] = [];
  const inputs: OpenUIInputForm[] = [];
  const outputTitles: Record<string, string> = {};
  const outputs = new Set<string>();
  const visited = new Set<object>();
  function visit(value: unknown) {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (isElement(value)) {
      if (value.partial) throw problem('界面组件尚未完成。');
      if (value.typeName === 'InputForm')
        inputs.push({
          inputPort: String(value.props.inputPort),
          ...(typeof value.props.output === 'string'
            ? { output: value.props.output }
            : {}),
          ...(typeof value.props.methodId === 'string'
            ? { methodId: value.props.methodId }
            : {}),
          ...(typeof value.props.methodDefinitionId === 'string'
            ? { methodDefinitionId: value.props.methodDefinitionId }
            : {}),
          ...(Array.isArray(value.props.fields)
            ? { fields: value.props.fields as string[] }
            : {}),
        });
      if (value.typeName === 'Records' || value.typeName === 'Report') {
        const output = value.props.output;
        if (typeof output !== 'string' || !output.trim())
          throw problem('成果组件需要明确输出。');
        outputs.add(output);
        outputTitles[output] = String(value.props.title);
        if (value.typeName === 'Records') {
          const rowKey = String(value.props.rowKey);
          const columns = asFields(value.props.columns);
          if (/[./]/.test(rowKey) || columns.some((c) => /[./]/.test(c.field)))
            throw problem('成果记录请声明顶层字段。');
          records.push({
            name: value.statementId || output,
            output,
            title: String(value.props.title),
            rowKey,
            columns,
            details: asFields(value.props.details),
            ...(typeof value.props.groupBy === 'string'
              ? { groupBy: value.props.groupBy }
              : {}),
          });
        }
      }
    }
    Object.values(value).forEach(visit);
  }
  visit(result.root);
  for (const form of inputs) {
    if (form.methodId && !form.output)
      throw problem('后续记录表单必须关联其固定output。');
    if (form.output && !outputs.has(form.output))
      throw problem('表单关联的output没有成果组件。');
  }
  const byOutput = new Map<string, string>();
  for (const view of records) {
    if (byOutput.has(view.output) && byOutput.get(view.output) !== view.rowKey)
      throw problem('同一输出不能声明不同记录编号字段。');
    byOutput.set(view.output, view.rowKey);
  }
  return {
    root: result.root,
    records,
    inputs,
    outputs: [...outputs],
    outputTitles,
    statements: split(tokenize(source)).map((s) => s.id),
    queries: result.queryStatements,
    mutations: result.mutationStatements,
  };
}
export const validateOpenUIProgram = parseOpenUIProgram;
export function mergeOpenUIProgram(existing: string, patch: string) {
  if (parser.parse(patch).meta.incomplete) throw problem('界面补丁尚未完成。');
  const source = mergeStatements(existing, patch);
  parseOpenUIProgram(source);
  return source;
}
