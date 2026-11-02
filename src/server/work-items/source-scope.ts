import type { WorkItem } from '../../shared/records.ts';
import { included } from './children.ts';

export type StageSourceScope = 'children' | 'descendants';
export function stageSourceScope(value: unknown): StageSourceScope {
  if (value === undefined || value === 'children') return 'children';
  if (value === 'descendants') return value;
  throw Error('来源范围应为 children 或 descendants。');
}

/** Every link must remain included; an excluded ancestor cuts the entire branch. */
export async function withinStageScope(
  rootId: string,
  item: WorkItem,
  read: (id: string) => Promise<WorkItem>,
  scope: StageSourceScope = 'children',
): Promise<boolean> {
  let current = item;
  const seen = new Set<string>([rootId]);
  while (current.parentId) {
    if (seen.has(current.id) || !included(current)) return false;
    seen.add(current.id);
    if (current.parentId === rootId) return true;
    if (scope === 'children') return false;
    current = await read(current.parentId);
  }
  return false;
}
