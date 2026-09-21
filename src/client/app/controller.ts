import { useState } from 'react';
import type { Snapshot } from '../../shared/records';
import { api, upload } from '../core/api';
import { runAction } from '../core/action';
import { splitMaterials } from '../core/format';
import { useConnection } from '../state/useConnection';
import { useDraft } from '../state/useDraft';
import { useSelection } from '../state/useSelection';
import { usePanels } from '../state/usePanels';
import { useActions } from '../state/useActions';

/**
 * 工作区组合根：连接、草稿、选择、面板、动作按依赖顺序组合，
 * 返回形状即各组件依赖的 WorkspaceController。
 */
export function useWorkspace() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const connection = useConnection(setError);
  const draft = useDraft(
    connection.snapshot,
    connection.snapshotRef,
    connection.workId,
  );
  const selection = useSelection(
    connection.snapshot,
    connection.work,
    draft.definition,
    draft,
  );
  const panels = usePanels(!!connection.workId);
  const actions = useActions({
    setBusy,
    setError,
    workId: connection.workId,
    activeWorkId: connection.activeWorkId,
    receive: connection.receive,
    work: connection.work,
    snapshot: connection.snapshot,
    definition: draft.definition,
    baseId: draft.baseId,
    setDirty: draft.setDirty,
    setLocalDefinition: draft.setLocalDefinition,
    editDefinition: draft.editDefinition,
    selectedNode: selection.selectedNode,
    selectedDefinitionId: selection.selectedDefinitionId,
    inputs: selection.inputs,
    selectedMaterials: selection.selectedMaterials,
    selectedResults: selection.selectedResults,
    setSelectedNode: selection.setSelectedNode,
    setSelectedRun: selection.setSelectedRun,
    setPreviewInputs: selection.setPreviewInputs,
    setPanel: panels.setPanel,
    setTab: panels.setTab,
    setTrialOpen: panels.setTrialOpen,
    setCandidateSource: panels.setCandidateSource,
    setSourceChoice: panels.setSourceChoice,
    setReplaceDraft: panels.setReplaceDraft,
    addKind: panels.addKind,
  });
  function openWork(id: string) {
    panels.setLibraryOpen(false);
    setError('');
    if (id === connection.workId) {
      connection.refetch(id);
      return;
    }
    connection.switchTo(id);
    draft.resetDraft();
    selection.resetSelection();
    panels.setTab('canvas');
  }
  function closeWork(id: string) {
    const index = connection.works.findIndex((item) => item.id === id);
    if (index < 0) return;
    connection.closeEntry(id);
    if (id !== connection.workId) return;
    const next = connection.works[index + 1] || connection.works[index - 1];
    connection.switchTo(next?.id || '');
    draft.resetDraft();
    selection.resetSelection();
    panels.setTab('canvas');
    if (!next) panels.setLibraryOpen(true);
    setError('');
  }
  async function create(file?: File): Promise<boolean> {
    const pasted = splitMaterials(panels.materialText);
    if (!panels.goal.trim()) {
      setError('请填写工作目标。');
      return false;
    }
    return Boolean(
      await runAction(
        async () => {
          // 创建只需目标；粘贴与文件均为可选来源，跟随文件时创建后自动剖析
          const next = await api<Snapshot>('/api/works', {
            goal: panels.goal.trim(),
            materials: pasted,
          });
          if (file && !pasted.length) {
            const stored = await upload(next.work.id, file);
            await api<Snapshot>(`/api/works/${next.work.id}/actions`, {
              action: 'importMaterials',
              file: stored,
            });
          }
          openWork(next.work.id);
          connection.receive(next);
          panels.setCreateOpen(false);
          panels.bumpLibrary();
          panels.setGoal('');
          panels.setMaterialText('');
          selection.setSelectedMaterials(next.work.materials.map((m) => m.id));
          panels.setPanel('assistant');
          return true;
        },
        { setBusy, setError },
      ),
    );
  }
  return {
    error,
    setError,
    busy,
    ...connection,
    ...draft,
    ...selection,
    ...panels,
    ...actions,
    openWork,
    closeWork,
    create,
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
