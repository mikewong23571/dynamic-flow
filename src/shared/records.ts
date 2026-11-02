import type { Expression } from './expressions.js';

export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type Status =
  | 'queued'
  | 'running'
  | 'stopping'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'waiting';
export interface FlowNode {
  id: string;
  label: string;
  kind:
    | 'agent'
    | 'function'
    | 'branch'
    | 'wait'
    | 'milestone'
    | 'file'
    | 'dynamic'
    | 'call'
    | 'create-items';
  /** Fixed method interface; eachPort selects the mapped input, other ports broadcast. */
  call?: {
    workId: string;
    definitionId: string;
    inputNames: string[];
    outputNames: string[];
    eachPort?: string;
  };
  contract?: {
    responsibility: string;
    done: string;
    rationale: string;
    semanticRole?: string;
  };
  dynamic?: { boundary: string; maxNodes: number };
  repeat?: { max: number; until?: Expression };
  task?: string;
  tools?: {
    builtin: ('read' | 'grep' | 'find' | 'ls' | 'bash' | 'edit' | 'write')[];
    mcp: ('websearch' | 'sourcegraph' | 'cveawg')[];
  };
  /** file 来源节点：指向工作 uploads 中的文件名，输出文件名供下游用运行时读取。 */
  file?: { name: string };
  operation?: 'map' | 'flatMap' | 'aggregate';
  concurrency?: number;
  inputSchema?: Json;
  wait?: { event: string; reason: string; timeoutSeconds?: number };
  milestone?: { stage: string; summary: string };
  expectedOutput?: Json;
  functionName?:
    | 'identity'
    | 'select-fields'
    | 'merge'
    | 'collect'
    | 'join'
    | 'groupBy'
    | 'expression';
  groupBy?: { keys: (string | number)[][] };
  inputNames?: string[];
  join?: {
    type: 'inner' | 'left' | 'right' | 'full';
    leftKey: (string | number)[];
    rightKey: (string | number)[];
    duplicates: 'all' | 'error';
  };
  expression?: Expression;
  params?: { fields?: string[] };
  condition?: {
    field: string;
    operator: 'equals' | 'contains' | 'exists';
    value?: Json;
  };
}
export interface Definition {
  /** Read-only origin when a saved method node is extracted for formal item processing. */
  sourceNode?: { workId: string; definitionId: string; nodeId: string };
  schemaVersion: 1;
  problem?: {
    framing: string;
    known: string;
    unknown: string;
    constraints: string;
    evidence: string;
  };
  inputs: string[];
  /** 严格入口契约：按端口声明条目 schema 与违约行为；未声明的端口保持宽松。 */
  inputContracts?: Record<string, InputContract>;
  nodes: FlowNode[];
  edges: { from: [string, string]; to: [string, string] }[];
  /** 可选摘要展示绑定，不改变节点expectedOutput运行合同；不识别标准卡片时按原值阅读。 */
  summaryOutput?: string;
  /** Explicit output containing actionable business records, separate from a text summary. */
  outputs: Record<string, [string, string]>;
}
/** 严格入口契约：条目形状与违约行为。宽松端口不声明契约。 */
export interface InputContract {
  /** 每条输入的 JSON Schema（draft-07，复用 flow/schema 校验）；缺省 = 任意值。 */
  item?: Record<string, unknown>;
  /** invoke 是否必须提供该端口输入；缺省 true。 */
  required?: boolean;
  /** 违约行为：reject（缺省，invoke 门口拒绝）| interpret（agent 修复环，复检仍败则拒绝）。 */
  onInvalid?: 'reject' | 'interpret';
}
export interface ContentMaterial {
  id: string;
  text: string;
  contentUrl?: string;
  characters?: number;
}
export interface InputItem {
  /** Exact frozen input when continuing a failed instance. */
  inputSource?: OutputReference;
  /** Top-level record fields for arranging a delivery without loading its body. */
  valueFields?: string[];
  /** Transport-only pointer: value is omitted, never an actual null result. */
  contentUrl?: string;
  /** Exact saved producer when selected as input or crossing a fixed call. */
  source?: OutputReference;
  sampleId: string;
  value: Json;
  materialIds: string[];
  sourceResultIds: string[];
}
export type Inputs = Record<string, InputItem[]>;
export interface Issue {
  message: string;
  nodeId?: string;
  edgeIndex?: number;
  field?: string;
}
export interface Activity {
  /** Transport-only pointer to the full saved tool arguments/result. */
  contentUrl?: string;
  id: string;
  toolCallId: string;
  toolName: string;
  status: 'running' | 'completed' | 'failed';
  args?: Json;
  result?: Json;
  error?: string;
}
export interface NodeResult {
  /** Real nested execution, persisted before dispatch and reused on recovery. */
  call?: ItemRunRef;
  /** Actual final model reply retained when output parsing/validation fails. */
  rawOutput?: string;
  id: string;
  runId: string;
  definitionId: string;
  nodeId: string;
  instanceId: string;
  iteration?: number;
  repeatDone?: boolean;
  intermediate?: boolean;
  purpose?: 'planning';
  proposedDefinition?: Json;
  input: Inputs;
  outputs: Inputs;
  status: Status;
  error?: string;
  activities: Activity[];
  effectiveModel?: EffectiveModel;
  startedAt: string;
  finishedAt?: string;
}
export interface Run {
  retrySource?: ItemRunRef & { resultIds: string[] };
  /** Frozen material scope for nested methods; never callee workspace samples. */
  materials: ContentMaterial[];
  /** An execution call is distinct from an independent child business item. */
  parentCall?: ItemRunRef & {
    nodeId: string;
    instanceId: string;
    resultId: string;
  };
  sampleSource?: RunSampleSource;
  inputSources?: OutputReference[];
  id: string;
  definitionId: string;
  scope: 'full' | { nodeId: string };
  inputs: Inputs;
  status: Status;
  stopRequested: boolean;
  comparisonId?: string;
  workItem?: WorkItemInput;
  effectMode?: 'commit' | 'preview';
  waits?: RunWait[];
  signals?: RunSignal[];
  nodeStates: Record<string, Status | 'blocked'>;
  nodeTotals?: Record<string, number>;
  results: NodeResult[];
  expansions?: {
    nodeId: string;
    definition: Definition;
    resultId: string;
    createdAt: string;
  }[];
  startedAt: string;
  finishedAt?: string;
  /** invoke 触发留痕：loose = 调用级豁免契约；repairedPorts = interpret 修复环实际修复的端口。 */
  invocation?: { loose?: boolean; repairedPorts?: string[] };
  error?: string;
}
export interface RunSampleSource {
  runId: string;
  resultIds: string[];
}
export interface Comparison {
  workItem?: WorkItemInput;
  inputSources?: OutputReference[];
  sampleSource?: RunSampleSource;
  id: string;
  baselineId: string;
  candidateId: string;
  nodeId: string;
  frozenInputs: Inputs;
  baselineRunId?: string;
  candidateRunId?: string;
  status: Status;
  stopRequested: boolean;
  createdAt: string;
  error?: string;
}
export interface AssistantConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}
/** A user's explicit reference to an immutable method version, not an execution request. */
export interface MethodReference {
  workId: string;
  definitionId: string;
  title: string;
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  methodReferences?: MethodReference[];
  conversationId?: string;
  createdAt?: string;
  status?: Status;
  requestId?: string;
  definitionId?: string;
  nodeId?: string;
  sampleIds?: string[];
  activities?: Activity[];
  error?: string;
  /** 本轮对话正常完成但未保存实际变更（纯分析/说明类回复）；缺省按已变更处理。 */
  unchanged?: boolean;
  proposedDefinition?: Definition;
  effectiveModel?: EffectiveModel;
}
export interface ViewState {
  positions: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
  showPorts?: boolean;
  routing?: {
    signature: string;
    routes: Record<string, { x: number; y: number }[]>;
  };
}
export interface Work {
  ownerItemId?: string;
  uiProgramTemplate?: import('./openui.js').OpenUIProgram;
  id: string;
  title?: string;
  titleEdited?: boolean;
  archivedAt?: string;
  goal: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  materials: ContentMaterial[];
  definitionIds: string[];
  draftId?: string;
  draftBaseId?: string;
  adoptedId?: string;
  view: ViewState;
  runs: Run[];
  comparisons: Comparison[];
  keptResultIds: string[];
  messages: ChatMessage[];
  assistantConversations?: AssistantConversation[];
  /** 按 scope 的模型覆盖；当前只有 assistant（对话），workflow 预留。 */
  modelSelections?: { assistant?: ModelSelection };
}
export interface Snapshot {
  work: Work;
  definitions: Record<string, Definition>;
  issues: Issue[];
}
export type ReasoningEffort =
  'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export interface ModelSettings {
  protocol:
    'anthropic-messages' | 'openai-chat-completions' | 'openai-responses';
  baseUrl: string;
  model: string;
  apiKey?: string;
  reasoningEffort: ReasoningEffort;
  temperature: number;
  topP: number;
  contextWindow: number;
}
export type ModelScope = 'assistant' | 'workflow';
export interface ModelSelection {
  alias: string;
  effort?: ReasoningEffort;
}
/** 模型目录公开条目（不含密钥）。supportedEfforts 为空表示该模型不设置思考级别。 */
export interface ModelCatalogEntry {
  alias: string;
  provider: string;
  model: string;
  displayName: string;
  protocol: ModelSettings['protocol'];
  baseUrl: string;
  contextWindow: number;
  supportedEfforts: ReasoningEffort[];
  defaultEffort?: ReasoningEffort;
  apiKeyConfigured: boolean;
}
/** 目录 provider 的公开信息（不含密钥与请求头内容）。 */
export interface ModelCatalogProvider {
  name: string;
  protocol: ModelSettings['protocol'];
  baseUrl: string;
  apiKeyConfigured: boolean;
  headersConfigured: boolean;
}
/** 本次调用实际生效的模型（无密钥），随消息与节点结果保存。 */
export interface EffectiveModel {
  source: 'work' | 'default';
  alias?: string;
  model: string;
  effort?: ModelSettings['reasoningEffort'];
}
/** 模型设置响应：目录（models.toml）是唯一模型配置来源。 */
export interface ModelConfiguration {
  ready: boolean;
  /** 未就绪原因：未选择默认模型、目录无法读取或默认选择失效，引导去目录配置。 */
  error?: string;
  warnings?: string[];
  catalog?: ModelCatalogEntry[];
  catalogProviders?: ModelCatalogProvider[];
  defaultSelection?: ModelSelection;
  /** 全局默认解析是否落到目录。 */
  resolved?: { default: 'catalog' | 'none' };
}
export interface WorkSummary {
  id: string;
  title?: string;
  goal: string;
  updatedAt: string;
  archivedAt?: string;
  definitionState?: 'empty' | 'draft' | 'adopted' | 'changed';
  nodeCount?: number;
}
export interface WorkPage {
  works: WorkSummary[];
  total: number;
  page: number;
  pageSize: number;
}
export interface StartRun {
  retrySource?: ItemRunRef & { resultIds: string[] };
  materials?: ContentMaterial[];
  /** Granted only by the explicit work-item single-step action. */
  commitScope?: 'node';
  sampleSource?: RunSampleSource;
  inputSources?: OutputReference[];
  workItem?: WorkItemInput;
  effectMode?: 'commit' | 'preview';
  definitionId: string;
  scope: Run['scope'];
  inputs: Inputs;
  comparisonId?: string;
}
export interface EditRequest {
  text: string;
  sampleSource?: RunSampleSource;
  methodReferences?: MethodReference[];
  expectedDraftId?: string;
  nodeId?: string;
  sampleIds?: string[];
}
export interface ImportRequest {
  file: string;
  note?: string;
}
export interface NodeExecution {
  /** Model final reply, copied to failed NodeResult by the runtime. */
  rawOutput?: string;
  problem?: Definition['problem'];
  iteration?: number;
  workItem?: WorkItemInput;
  /** Only a full commit execution may expose business reporting. */
  effectMode?: 'commit' | 'preview';
  scope?: Run['scope'];
  workId: string;
  runId: string;
  definitionId: string;
  node: FlowNode;
  instanceId: string;
  inputs: Inputs;
  materials: Work['materials'];
  signal: AbortSignal;
  onActivity: (activity: Activity) => Promise<void>;
  /** executeNode 在请求开始固定配置后写入本次生效模型，由 runs 存进 NodeResult。 */
  effectiveModel?: EffectiveModel;
}

// A business item outlives any method workspace or individual execution.
export interface CriterionReference extends ItemRunRef {
  port?: string;
  index?: number;
  label: string;
  resultId: string;
  nodeId?: string;
  instanceId?: string;
}
export interface CompletionCriterion {
  references?: CriterionReference[];
  id: string;
  text: string;
  met: boolean;
  evidence: string;
}
export interface WorkItemInput {
  /** Transport-only marker for frozen context omitted from a run overview. */
  contextOmitted?: boolean;
  receivedInputs?: ReceivedItemInput[];
  id: string;
  key: string;
  title: string;
  goal: string;
  revision: number;
  data: Record<string, Json>;
  materials: ContentMaterial[];
}
/** Explicit material selection for a saved version of the current method. */
export interface OutputReference {
  workId: string;
  runId: string;
  resultId: string;
  port: string;
  index: number;
}
export type ItemInputSelection =
  | { kind: 'material'; materialId: string }
  | { kind: 'result'; source: OutputReference }
  | {
      kind: 'child-results';
      itemId: string;
      sources: OutputReference[];
      scope?: 'children' | 'descendants';
    }
  | { kind: 'received'; inputId: string }
  | {
      kind: 'completion';
      itemId: string;
      completionHistoryId: string;
      historical?: boolean;
    };
/** One selected child becomes one input; output values stay unchanged within it. */
export interface ChildStageValue {
  item: {
    id: string;
    key: string;
    title: string;
    goal: string;
    data: Record<string, Json>;
  };
  outputs: { source: OutputReference; value: Json }[];
}
/** Read-only discovery; references, counts and previews, no editable result copies. */
export interface ChildStageInputs {
  children: {
    id: string;
    key: string;
    title: string;
    excluded: boolean;
    issues: string[];
    runs: (ItemRunRef & {
      title: string;
      round: number;
      status: Status;
      startedAt: string;
      groups: {
        nodeId: string;
        port: string;
        label: string;
        final: boolean;
        summary: boolean;
        outputs: {
          source: OutputReference;
          preview: string;
          entries?: number;
        }[];
      }[];
    })[];
  }[];
}
export interface WorkItemRunSelection {
  scope?: Run['scope'];
  definitionId: string;
  baseRevision?: number;
  inputBindings?: Record<string, ItemInputSelection[]>;
}
export interface ItemRunRef {
  workId: string;
  runId: string;
  definitionId: string;
}
export interface ItemHistory {
  id: string;
  at: string;
  kind:
    | 'created'
    | 'evidence'
    | 'milestone'
    | 'progress'
    | 'criteria'
    | 'completed'
    | 'reopened'
    | 'method'
    | 'run'
    | 'children'
    | 'scope'
    | 'input'
    | 'interface';
  summary: string;
  uiSnapshot?: {
    program: import('./openui.js').OpenUIProgram;
    deliveries: import('./workitem-composition.js').ItemDelivery[];
  };
  source?: ItemRunRef & {
    nodeId?: string;
    instanceId?: string;
    resultIds?: string[];
  };
  origin?: 'agent' | 'external';
  progress?: { stage: string; nextAction?: string; blocker?: string };
  materialIds?: string[];
  criteria?: CompletionCriterion[];
  childCompletions?: CompletionReference[];
  confirmedScope?: string[];
  completionTitle?: string;
  completionGoal?: string;
  completionData?: Record<string, Json>;
  childLinks?: ChildCreationReceipt[];
}
export interface WorkItem extends WorkItemInput {
  uiProgram?: import('./openui.js').OpenUIProgram;
  workId: string;
  inputBindings: Record<string, ItemInputSelection[]>;
  deliveries: import('./workitem-composition.js').ItemDelivery[];
  parentId?: string;
  parentScope?: {
    status: 'included' | 'excluded';
    reason?: string;
    at: string;
  };
  origin?: CandidateOrigin;
  trackingKey?: string;
  status: 'open' | 'completed';
  stage: string;
  summary: string;
  nextAction?: string;
  blocker?: string;
  criteria: CompletionCriterion[];
  runs: ItemRunRef[];
  history: ItemHistory[];
  createdAt: string;
  updatedAt: string;
  progressAt: string;
}
export interface RunWait {
  /** A projected nested wait; signals target its actual execution, not this display row. */
  source?: ItemRunRef & { nodeId: string };
  nodeId: string;
  event: string;
  reason: string;
  dueAt?: string;
  status: 'pending' | 'released';
  releasedBy?: 'event' | 'timer';
  signalId?: string;
}
export interface RunSignal {
  id: string;
  name: string;
  payload?: Json;
  receivedAt: string;
}
export interface WorkItemView extends WorkItem {
  effectiveStatus:
    'open' | 'running' | 'waiting' | 'attention' | 'review' | 'completed';
  execution?: ItemRunRef & {
    status: Status;
    waits: RunWait[];
    error?: string;
    inputRevision?: number;
    activeNodes: {
      id: string;
      label: string;
      responsibility?: string;
      parentLabel?: string;
    }[];
  };
}
export interface WorkItemSummary {
  total: number;
  pending: number;
  review: number;
  open: number;
  running: number;
  waiting: number;
  attention: number;
  completed: number;
}
export interface WorkItemPage {
  items: WorkItemView[];
  total: number;
  summary: WorkItemSummary;
}
export interface WorkItemProgressReport {
  id: string;
  stage: string;
  summary: string;
  nextAction?: string;
  blocker?: string;
  materialIds?: string[];
  expectedRevision?: number;
  source?: ItemRunRef & { nodeId: string; instanceId: string };
}
export interface CreateWorkItem {
  parentId?: string;
  receivedInputs?: Omit<ReceivedItemInput, 'id'>[];
  confirmReopen?: boolean;
  key?: string;
  title: string;
  goal: string;
  criteria?: string[];
  materials: string[];
  data?: Record<string, Json>;
}

/** Explicit handoff: values remain JSON; a revision never changes the original. */
export interface ReceivedItemInput {
  inputSource?: OutputReference;
  contentUrl?: string;
  id: string;
  label: string;
  value: Json;
  source?: OutputReference;
  replacesId?: string;
  revised?: boolean;
  origin?: CandidateOrigin & { inputIndex: number };
  materials?: ContentMaterial[];
}
export type CandidateSource = OutputReference & {
  kind: 'output' | 'node-input';
};
export interface CandidateOrigin {
  source: CandidateSource;
  candidateId: string;
}
export interface WorkItemCandidate {
  id: string;
  title: string;
  goal: string;
  data?: Record<string, Json>;
  criteria?: string[];
  trackingKey?: string;
  inputs: Omit<ReceivedItemInput, 'id'>[];
  existingChildId?: string;
}
export interface ChildCreationReceipt {
  inputsAppended?: boolean;
  candidateId: string;
  status: 'created' | 'linked' | 'needs-input' | 'failed';
  childId?: string;
  error?: string;
  source?: CandidateSource;
}
export interface CreateChildrenRequest {
  appendInputs?: boolean;
  candidates?: WorkItemCandidate[];
  source?: CandidateSource;
  candidateIds?: string[];
  edits?: WorkItemCandidate[];
  confirmReopen?: boolean;
}
export interface CompletionReference {
  itemId: string;
  completionHistoryId: string;
}
export interface ItemPreparation {
  itemId: string;
  workId?: string;
  definitionId?: string;
  baseRevision?: number;
  inputBindings: Record<string, ItemInputSelection[]>;
  inputs?: Inputs;
  issues: string[];
  createsChildren?: boolean;
}
export interface WorkItemSummaryRow {
  id: string;
  key: string;
  title: string;
  goal: string;
  parentId?: string;
  parentTitle?: string;
  parentScope?: WorkItem['parentScope'];
  status: WorkItem['status'];
  effectiveStatus: WorkItemView['effectiveStatus'];
  stage: string;
  summary: string;
  blocker?: string;
  nextAction?: string;
  workId: string;
  progressAt: string;
  createdAt: string;
  runs: ItemRunRef[];
  execution?: {
    status: Status;
    workId: string;
    runId: string;
    definitionId: string;
  };
  childCount: number;
  completedChildCount: number;
  todo?: 'process' | 'running' | 'waiting' | 'blocked' | 'review' | 'confirm';
  completion?: CompletionReference;
}
export interface WorkItemSummaryPage {
  items: WorkItemSummaryRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: WorkItemSummary;
  scopeSummary: WorkItemSummary;
  todoTotal: number;
}
