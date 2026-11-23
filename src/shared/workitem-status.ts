import type { Run, Status, WorkItem, WorkItemView } from './records';

export interface ItemStatusSignals {
  /** Included child items currently running (parent should not appear idle). */
  activeChildren?: boolean;
  /** Latest completed run is a partial retry that left failed source results unretried. */
  unretriedFailures?: boolean;
}

export interface RetryRunSummary {
  id: string;
  status: Status;
  retrySource?: Run['retrySource'];
  failedResultIds?: string[];
}

/** Reopen/method edits begin a new intent; prior executions remain history. */
export function awaitingItemRun(item: Pick<WorkItem, 'history'>) {
  const latest = item.history
    .filter((entry) => ['run', 'reopened', 'method'].includes(entry.kind))
    .at(-1);
  return latest?.kind === 'reopened' || latest?.kind === 'method';
}

/** Check whether a completed partial-retry run still leaves failed source results unretried. */
export function hasUnretriedFailures(
  latest: RetryRunSummary | undefined,
  source: RetryRunSummary | undefined,
  relatedRuns: readonly RetryRunSummary[],
): boolean {
  if (!latest || latest.status !== 'completed' || !latest.retrySource)
    return false;
  if (!source?.failedResultIds?.length) return false;
  const { workId, runId } = latest.retrySource;
  const retried = new Set<string>();
  for (const run of relatedRuns) {
    if (
      run.status === 'completed' &&
      run.retrySource?.workId === workId &&
      run.retrySource.runId === runId
    )
      for (const id of run.retrySource.resultIds) retried.add(id);
  }
  return source.failedResultIds.some((id) => !retried.has(id));
}

/** A read projection only: completed execution needs review, never automatic closure. */
export function effectiveItemStatus(
  item: Pick<WorkItem, 'status' | 'blocker' | 'history'>,
  execution?: Status,
  signals?: ItemStatusSignals,
): WorkItemView['effectiveStatus'] {
  if (item.status === 'completed') return 'completed';
  const status = awaitingItemRun(item) ? undefined : execution;
  if (status === 'waiting') return 'waiting';
  if (
    (status && ['queued', 'running', 'stopping'].includes(status)) ||
    signals?.activeChildren
  )
    return 'running';
  if (signals?.unretriedFailures) return 'attention';
  if (status === 'completed') return 'review';
  if (
    item.blocker?.trim() ||
    (status && ['failed', 'cancelled', 'interrupted'].includes(status))
  )
    return 'attention';
  return 'open';
}
