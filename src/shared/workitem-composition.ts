import type {
  Definition,
  Json,
  OutputReference,
  Snapshot,
  WorkItemView,
} from './records.js';
import type { OpenUIProgram } from './openui.js';

/** One explicit formal run output slice participating in a composed delivery. */
export interface DeliverySourceSlice {
  workId: string;
  runId: string;
  definitionId: string;
  /** Declared output name on that run's definition (e.g. "rows"). */
  output?: string;
  /** Explicit nodeId and port when combining step/retry outputs directly. */
  nodeId?: string;
  port?: string;
  /** Optional explicit completed result IDs (e.g. succeeded instances from a failed run). */
  resultIds?: string[];
}

/** A fixed business output and the program/record identity used to publish it. */
export interface ItemDelivery {
  id: string;
  createdAt: string;
  workId: string;
  runId: string;
  definitionId: string;
  output: string;
  uiProgramId: string;
  recordContract?: { rowKey: string };
  /**
   * Optional ordered multi-run source slices for composed delivery.
   * Later slices override earlier rows with the same recordContract.rowKey
   * while preserving each row's exact OutputReference source.
   */
  composedSources?: DeliverySourceSlice[];
}
export interface MethodCapability {
  workId: string;
  title: string;
  goal: string;
  definitionId: string;
  inputs: string[];
  outputs: string[];
  inputContracts?: Definition['inputContracts'];
  outputContracts?: Record<string, Json | null>;
  effects?: { kind: string; label: string }[];
  definition?: Definition;
  adopted?: boolean;
  uiProgramTemplate?: OpenUIProgram;
}
export type ItemDeliveryView = ItemDelivery & {
  recordsOmitted?: boolean;
  rows?: Json[];
  value?: Json;
  sources: OutputReference[];
  error?: string;
};
export interface ItemWorkspace {
  item: WorkItemView;
  work?: Snapshot;
  methods: MethodCapability[];
  uiProgram?: OpenUIProgram;
  uploads: string[];
  deliveries: ItemDeliveryView[];
}
export interface WorkspaceCheckIssue {
  code: string;
  area: 'flow' | 'inputs' | 'ui' | 'run' | 'state';
  path: string;
  message: string;
  hint?: string;
  expected?: string;
  actual?: string;
}
export interface WorkspaceCheck {
  checked: {
    itemRevision: number;
    definitionId?: string;
    programId?: string;
    runId?: string;
  };
  canExecute: boolean;
  canPublish: boolean;
  issues: WorkspaceCheckIssue[];
  unchecked: WorkspaceCheckIssue[];
  inputs: { port: string; count: number; types: string[] }[];
  publication: { current: boolean; missingOutputs: string[] };
}
export interface WorkspaceCheckProposal {
  definition?: unknown;
  source?: string;
  runId?: string;
}
