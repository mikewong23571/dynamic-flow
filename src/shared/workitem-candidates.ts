import type { WorkItemCandidate } from './records.js';

/** Read an explicit candidate container; ordinary arrays are never promoted implicitly. */
export function parseCandidates(value: unknown): WorkItemCandidate[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && 'candidates' in value
      ? value.candidates
      : undefined;
  if (!Array.isArray(list)) throw Error('请选择明确的问题候选清单。');
  const ids = new Set<string>();
  for (const candidate of list) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate) ||
      typeof candidate.id !== 'string' ||
      !candidate.id.trim() ||
      ids.has(candidate.id)
    )
      throw Error('候选编号缺失或重复。');
    ids.add(candidate.id);
  }
  // Missing business fields remain editable per-item gaps, rather than losing the whole list.
  return structuredClone(list) as WorkItemCandidate[];
}
