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
export const openuiInstructions = openuiContract.prompt({
  preamble:
    'This is the language reference ONLY for the source/patch arguments of check_ui_program, save_ui_program and update_ui_program. All output-format and edit rules below apply to those program strings. The business Assistant must save programs through tools and give the user a short natural-language final reply about actual saved work, remaining gaps and next action; do not repeat program source in the chat reply.',
  toolCalls: true,
  bindings: true,
  editMode: true,
  builtinFunctions: true,
  tools: [...openuiReadTools, ...openuiWriteTools],
  additionalRules: [
    'Examples illustrate individual API usages, not a required page structure. Choose presentation from the business needs under the system principles.',
    'Use native OpenUI Lang. Save the full source with save_ui_program, or patch named statements with update_ui_program. No ItemUiPlan JSON.',
    'The UI lets the user understand and participate in this particular work throughout processing, not only inspect final delivery. First decide what business questions the user needs answered now, then bind those facts to useful views and actions. Do not make a plan/explanation page the default substitute for a working interface.',
    'Query may only use read_workspace, read_inputs, read_children, read_output or read_delivery. Mutations may only use submit_input, continue_records, bind_inputs, execute, publish_delivery, review.',
    'read_workspace({}) returns {item,work,deliveries,...}. item has stage,summary,nextAction,blocker,effectiveStatus,criteria,execution(activeNodes/waits/status/error), and actual history. Business stage is distinct from execution status. Details(title,query.item,[Field(property,businessLabel)]) displays chosen facts. Do not copy these changing facts into TextContent literals.',
    'read_inputs({inputPort,offset?,limit?}) reads the current explicitly bound input values using the same resolver as execution. Returns {definitionId,revision,rows,sources,total,offset,limit}; rows contains actual bound business values, with their original fields, not label/value or input metadata wrappers. received revisions and source references are resolved by the server, not reconstructed from all old receivedInputs. Use this to show what is already known before execution. A not-yet-run output is not an empty business scope.',
    'read_children({scope?:"children"|"descendants",status?,query?,page?,pageSize?}) returns the existing scoped {items,total,page,pageSize,summary,scopeSummary,todoTotal}. Summary counts describe the selected scope; rows have id,title,stage,summary,blocker,nextAction,effectiveStatus,childCount,completedChildCount. Use Metric with counts and DataTable with rows as useful to this work; do not create a child dashboard when there are no child tasks.',
    "read_output({output?,nodeId?,port?,runId?,offset?,limit?}) reads actual stage output from this item's explicitly selected run; omitted runId observes its current execution. Returns {run,rows,sources,total,offset,limit}; run may be null before execution, rows contains only actual completed instance outputs even while the run is running/waiting/failed. Choose either an exported output name or an exact nodeId+port from the fixed Definition. The latter also observes successful stages that are not exported, without changing the old definition. Never guess a different source when the requested stage has not produced results. This is observation, not publication. DataTable can inspect object rows; Details can inspect a chosen object. Preserve sources for further reasoning/actions.",
    'Input/output rows are paged. Use total for the whole returned scope, existing children summary for child counts, and actual aggregate method output for business counts; never label counts of the current page as global totals. Before execution show pending/unknown for execution-derived findings and statistics; empty Query defaults are loading data, not completed business results.',
    'All live Query reads must declare a positive refresh interval in seconds, normally 2, using the native fourth argument. This keeps data current without regenerating source or resetting user drafts. Use null/empty defaults while loading, not fabricated business data. read_delivery({output}) reads the fixed published delivery.',
    'Section(title,children) declares an explicit business group with a light default boundary; related data, text, forms and actions can share one group. Nest Section for real subgroups; the renderer handles heading levels and accessible names. Choose group names/count/content from the current work, never from a fixed page template or child component types. Stack(children,direction?) only arranges content without a business boundary or heading; horizontal wraps at narrow widths. An empty title on content/form components omits their heading when a parent already names them. Disclosure(title,children) holds optional detail. Dialog(title,$open,children) opens via @Set and closes by updating the same binding. Use native @Each(rows,"row", inlineComponentTemplate) for per-record composition and actions; the loop variable only exists inside that inline template. A contextual action can @Set($draft,{id:row.id}) and then @Set($open,true), so one real InputForm edits the chosen record without another business page.',
    'ActionButton(label,action?,emphasis?,disabled?) uses primary, secondary or quiet emphasis; secondary is the default. disabled is a live boolean. Business labels and placement come from the actual task. Execution remains guarded by the same server command.',
    'DataTable and Records only show selection checkboxes when selection is explicitly bound. Search is opt-in through the final searchable argument. Their detail reader stays available, while custom per-row presentation/actions can use native @Each and the composition components.',
    'Records(output,title,rowKey,columns,selection?,actions?,details?,groupBy?,searchable?) reads real saved delivery data. Field(field,label) names an actual top-level field; IDs are non-empty unique strings.',
    'InputForm(inputPort,title,$draft,button,methodId?,methodDefinitionId?,fields?,output?) uses the real fixed input contract. Optional method IDs select an existing follow-up method; fields limits the form to its real properties. A record follow-up form must name output so its draft resets with that fixed delivery. submit_input takes {inputPort,value:$draft,label?}.',
    'continue_records takes {output,recordIds:$selected,inputPort?,methodId?,methodDefinitionId?,draft?:$draft,recordField?}. For a follow-up form, draft contains only user fields; the server puts the original record into recordField. Never pass record bodies or rowKey.',
    'execute takes no business values. publish_delivery takes {runId,output}. review only opens the application acceptance task.',
    'Keep the UI useful before execution, show missing real data honestly, and use @ToAssistant for requests that require new reasoning.',
    'The app already provides process inspection and input management. Add business views because the user needs different data or actions, not to repeat goal/process/status explanations. TextContent is for concise guidance; changing status, counts, findings and gaps come from real data bindings. Business labels, fields, grouping and final presentation are chosen for this work, not copied variable names.',
    'Never use mock/sample business data as fallback, even if the general SDK prompt suggests it. Missing tools or real data stay explicit gaps; use empty/null query defaults, never invented findings or counts.',
    'Never describe a result as completed because a UI was generated. The app owns real runs, sources, waiting and final confirmation.',
  ],
  toolExamples: [
    // Syntax examples, not a prescribed workspace structure.
    `root = Workspace("读取内容", [content])\nobserved = Query("read_output", {output: "result"}, {rows: [], sources: []}, 2)\ncontent = DataTable("内容", observed.rows, "id", [Field("id", "编号"), Field("title", "事项")])`,
    `root = Workspace("处理清单", [handling, supplement])\nhandling = Section("处理事项", [records])\nsupplement = Section("补充资料", [form])\n$selected = []\n$draft = {}\nrecords = Records("records", "", "id", [Field("id", "编号"), Field("title", "事项")], $selected, [next])\nnext = ActionButton("继续所选记录", @Run(continueStep))\ncontinueStep = Mutation("continue_records", {output: "records", recordIds: $selected})\nform = InputForm("request", "", $draft, save)\nsave = ActionButton("保存输入", @Run(saveInput))\nsaveInput = Mutation("submit_input", {inputPort: "request", value: $draft})`,
  ],
});
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
