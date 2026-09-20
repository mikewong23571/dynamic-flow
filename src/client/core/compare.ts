import type { Comparison, Inputs } from '../../shared/records';

export function inputFingerprint(inputs: Inputs) {
  return JSON.stringify(
    Object.keys(inputs)
      .sort()
      .map((port) => [
        port,
        [...inputs[port]]
          .sort((a, b) => a.sampleId.localeCompare(b.sampleId))
          .map((i) => ({
            sampleId: i.sampleId,
            value: i.value,
            materialIds: [...i.materialIds].sort(),
            sourceResultIds: [...i.sourceResultIds].sort(),
          })),
      ]),
  );
}
export const comparisonStale = (
  comparison: Comparison,
  draftId: string | undefined,
  inputs: Inputs,
  hasUnsavedChanges = false,
) =>
  hasUnsavedChanges ||
  comparison.candidateId !== draftId ||
  inputFingerprint(comparison.frozenInputs) !== inputFingerprint(inputs);
