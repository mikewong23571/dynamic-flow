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

/** 比较展示所选责任的末轮产物；展开/迭代通过真实来源回溯冻结样本。 */
export function comparisonResult(
  run: Run | undefined,
  nodeId: string,
  sampleId: string,
): NodeResult | undefined {
  if (!run) return undefined;
  const byId = new Map(run.results.map((r) => [r.id, r]));
  const matches = (result: NodeResult, seen = new Set<string>()): boolean => {
    if (seen.has(result.id)) return false;
    seen.add(result.id);
    return Object.values(result.input)
      .flat()
      .some(
        (item) =>
          item.sampleId === sampleId ||
          item.sourceResultIds.some((id) => {
            const parent = byId.get(id);
            return parent ? matches(parent, seen) : false;
          }),
      );
  };
  const latest = [...run.results].reverse();
  return (
    latest.find(
      (r) => r.nodeId === nodeId && !r.intermediate && !r.purpose && matches(r),
    ) ??
    latest.find((r) => ['failed', 'cancelled'].includes(r.status) && matches(r))
  );
}
