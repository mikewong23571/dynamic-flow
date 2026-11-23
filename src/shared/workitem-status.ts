import type { Status, WorkItem, WorkItemView } from './records';

/** Reopen/method edits begin a new intent; prior executions remain history. */
export function awaitingItemRun(item: Pick<WorkItem, 'history'>) {
  const latest = item.history
    .filter((entry) => ['run', 'reopened', 'method'].includes(entry.kind))
    .at(-1);
  return latest?.kind === 'reopened' || latest?.kind === 'method';
}
/** A read projection only: completed execution needs review, never automatic closure. */
export function effectiveItemStatus(
  item: Pick<WorkItem, 'status' | 'blocker' | 'history'>,
  execution?: Status,
): WorkItemView['effectiveStatus'] {
  if (item.status === 'completed') return 'completed';
  const status = awaitingItemRun(item) ? undefined : execution;
  if (status === 'waiting') return 'waiting';
  if (status && ['queued', 'running', 'stopping'].includes(status))
    return 'running';
  if (status === 'completed') return 'review';
  if (
    item.blocker?.trim() ||
    (status && ['failed', 'cancelled', 'interrupted'].includes(status))
  )
    return 'attention';
  return 'open';
}
