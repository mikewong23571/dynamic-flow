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
  kind: 'agent' | 'function' | 'branch' | 'wait' | 'milestone' | 'file';
  mode: 'each' | 'all';
  task?: string;
  /** file 来源节点：指向工作 uploads 中的文件名，输出文件名供下游用运行时读取。 */
  file?: { name: string };
  operation?: 'map' | 'flatMap' | 'aggregate';
  concurrency?: number;
  inputSchema?: Json;
  wait?: { event: string; reason: string; timeoutSeconds?: number };
  milestone?: { stage: string; summary: string };
  expectedOutput?: Json;
  functionName?:
    'identity' | 'select-fields' | 'merge' | 'collect' | 'join' | 'expression';
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
  schemaVersion: 1;
  inputs: string[];
  nodes: FlowNode[];
  edges: { from: [string, string]; to: [string, string] }[];
  outputs: Record<string, [string, string]>;
}
export interface InputItem {
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
  id: string;
  toolCallId: string;
  toolName: string;
  status: 'running' | 'completed' | 'failed';
  args?: Json;
  result?: Json;
  error?: string;
}
export interface NodeResult {
  id: string;
  runId: string;
  definitionId: string;
  nodeId: string;
  instanceId: string;
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
  startedAt: string;
  finishedAt?: string;
  error?: string;
}
export interface Comparison {
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
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status?: Status;
  requestId?: string;
  definitionId?: string;
  nodeId?: string;
  sampleIds?: string[];
  activities?: Activity[];
  error?: string;
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
  id: string;
  title?: string;
  titleEdited?: boolean;
  archivedAt?: string;
  goal: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  materials: { id: string; text: string }[];
  definitionIds: string[];
  draftId?: string;
  draftBaseId?: string;
  adoptedId?: string;
  view: ViewState;
  runs: Run[];
  comparisons: Comparison[];
  keptResultIds: string[];
  messages: ChatMessage[];
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
  workItem?: WorkItemInput;
  effectMode?: 'commit' | 'preview';
  definitionId: string;
  scope: Run['scope'];
  inputs: Inputs;
  comparisonId?: string;
}
export interface EditRequest {
  text: string;
  expectedDraftId?: string;
  nodeId?: string;
  sampleIds?: string[];
}
export interface ImportRequest {
  file: string;
  note?: string;
}
export interface NodeExecution {
  workItem?: WorkItemInput;
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
export interface CompletionCriterion {
  id: string;
  text: string;
  met: boolean;
  evidence: string;
}
export interface WorkItemInput {
  id: string;
  key: string;
  title: string;
  goal: string;
  revision: number;
  data: Record<string, Json>;
  materials: { id: string; text: string }[];
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
    | 'criteria'
    | 'completed'
    | 'reopened'
    | 'method'
    | 'run';
  summary: string;
  source?: ItemRunRef & { nodeId?: string; resultIds?: string[] };
  materialIds?: string[];
  criteria?: CompletionCriterion[];
}
export interface WorkItem extends WorkItemInput {
  workflowId: string;
  status: 'open' | 'completed';
  stage: string;
  summary: string;
  criteria: CompletionCriterion[];
  runs: ItemRunRef[];
  history: ItemHistory[];
  createdAt: string;
  updatedAt: string;
  progressAt: string;
}
export interface RunWait {
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
  effectiveStatus: 'open' | 'running' | 'waiting' | 'attention' | 'completed';
  execution?: ItemRunRef & {
    status: Status;
    waits: RunWait[];
    error?: string;
    inputRevision?: number;
  };
}
export interface WorkItemPage {
  items: WorkItemView[];
  total: number;
}
export interface CreateWorkItem {
  key: string;
  title: string;
  goal: string;
  workflowId: string;
  criteria: string[];
  materials: string[];
  data?: Record<string, Json>;
}
