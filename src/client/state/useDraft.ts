import { useEffect, useMemo, useRef, useState } from 'react';
import type { Definition, Snapshot } from '../../shared/records';
import { changeSummary } from '../core/definition';

const emptyDefinition: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [],
  edges: [],
  outputs: {},
};

interface PendingDraft {
  definition: Definition;
  baseId?: string;
}

/** 本地未保存的流程草稿：编辑、放弃与变更摘要。 */
export function useDraft(
  snapshot: Snapshot | null,
  snapshotRef: React.RefObject<Snapshot | null>,
  workId: string,
) {
  const [localDefinition, setLocalDefinition] = useState<Definition | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);
  const baseId = useRef<string | undefined>(undefined);
  const work = snapshot?.work;
  const definition =
    localDefinition ||
    snapshot?.definitions[work?.draftId || work?.adoptedId || ''] ||
    emptyDefinition;
  useEffect(() => {
    if (!work || dirty) return;
    baseId.current = work.draftId;
    setLocalDefinition(
      snapshot?.definitions[work.draftId || work.adoptedId || ''] || null,
    );
  }, [snapshot, dirty]);
  function editDefinition(next: Definition) {
    if (!dirty) baseId.current = work?.draftId;
    setLocalDefinition(next);
    setDirty(true);
  }
  function discardLocalChanges() {
    const latest = snapshotRef.current;
    if (!latest || latest.work.id !== workId) return;
    baseId.current = latest.work.draftId;
    setLocalDefinition(
      latest.definitions[latest.work.draftId || latest.work.adoptedId || ''] ||
        null,
    );
    setDirty(false);
    const key = `dynamic-flow.context.${workId}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}') as {
        pendingDraft?: PendingDraft;
      };
      delete saved.pendingDraft;
      localStorage.setItem(key, JSON.stringify(saved));
    } catch {
      localStorage.removeItem(key);
    }
  }
  function resetDraft() {
    setDirty(false);
    setLocalDefinition(null);
    baseId.current = undefined;
  }
  const base =
    snapshot?.definitions[work?.draftBaseId || work?.adoptedId || ''];
  const changes = useMemo(
    () => changeSummary(base, definition),
    [base, definition],
  );
  return {
    localDefinition,
    setLocalDefinition,
    dirty,
    setDirty,
    baseId,
    definition,
    changes,
    editDefinition,
    discardLocalChanges,
    resetDraft,
  };
}
