export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type Status =
  | 'queued'
  | 'running'
  | 'stopping'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';
export interface FlowNode {
  id: string;
  label: string;
  kind: 'agent' | 'function' | 'branch';
  mode: 'each' | 'all';
  task?: string;
  expectedOutput?: Json;
  functionName?: 'identity' | 'select-fields' | 'merge';
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
}
export interface ViewState {
  positions: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
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
}
export interface Snapshot {
  work: Work;
  definitions: Record<string, Definition>;
  issues: Issue[];
}
export interface ModelSettings {
  protocol:
    'anthropic-messages' | 'openai-chat-completions' | 'openai-responses';
  baseUrl: string;
  model: string;
  apiKey?: string;
  reasoningEffort: 'low' | 'medium' | 'high' | 'max';
  temperature: number;
  topP: number;
  contextWindow: number;
}
export interface ModelConfiguration extends Omit<ModelSettings, 'apiKey'> {
  ready: boolean;
  apiKeyConfigured: boolean;
  source: 'env' | 'workspace';
  error?: string;
  warnings?: string[];
  supportedReasoningEfforts?: ModelSettings['reasoningEffort'][];
}
export interface WorkSummary {
  id: string;
  title?: string;
  goal: string;
  updatedAt: string;
  archivedAt?: string;
}
export interface WorkPage {
  works: WorkSummary[];
  total: number;
  page: number;
  pageSize: number;
}
export interface StartRun {
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
export interface NodeExecution {
  workId: string;
  runId: string;
  definitionId: string;
  node: FlowNode;
  instanceId: string;
  inputs: Inputs;
  materials: Work['materials'];
  signal: AbortSignal;
  onActivity: (activity: Activity) => Promise<void>;
}
