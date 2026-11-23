import type { Inputs, RunSampleSource, Work } from '../../shared/records.ts';

/** Historical samples are the saved node inputs, not the node's outputs. */
export function readRunSamples(
  work: Work,
  selection: RunSampleSource,
  nodeId: string,
) {
  if (
    !selection ||
    typeof selection.runId !== 'string' ||
    !Array.isArray(selection.resultIds) ||
    !selection.resultIds.length ||
    new Set(selection.resultIds).size !== selection.resultIds.length
  )
    throw Error('请选择本次试验的原始输入。');
  const source = work.runs.find((run) => run.id === selection.runId);
  if (!source) throw Error('找不到原始输入所在的运行。');
  const results = source.results.filter((result) =>
    selection.resultIds.includes(result.id),
  );
  if (
    results.length !== selection.resultIds.length ||
    results.some(
      (result) =>
        result.nodeId !== nodeId || result.purpose || result.intermediate,
    )
  )
    throw Error('所选原始输入不属于当前步骤。');
  const inputs: Inputs = {};
  for (const result of results)
    for (const [port, entries] of Object.entries(result.input))
      (inputs[port] ??= []).push(...structuredClone(entries));
  const ids = new Set(
    Object.values(inputs)
      .flat()
      .flatMap((entry) => entry.materialIds),
  );
  return {
    inputs,
    workItem: source.workItem
      ? {
          ...structuredClone(source.workItem),
          materials: source.workItem.materials
            .filter((material) => ids.has(material.id))
            .map((material) => structuredClone(material)),
        }
      : undefined,
    inputSources: structuredClone(source.inputSources),
    sampleSource: structuredClone(selection),
  };
}
