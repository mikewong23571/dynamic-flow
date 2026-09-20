import type { NodeResult, Run } from '../../shared/records';

export function resultItems(result: NodeResult) {
  return Object.values(result.outputs).flat();
}
export function nodeTotal(run: Run, nodeId: string) {
  const totals = (run as Run & { nodeTotals?: Record<string, number> })
    .nodeTotals;
  return (
    totals?.[nodeId] ?? run.results.filter((r) => r.nodeId === nodeId).length
  );
}
