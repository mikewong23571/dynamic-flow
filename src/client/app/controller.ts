import { useEffect, useState } from 'react';
import type { Snapshot } from '../../shared/records';
import { api, upload } from '../core/api';
import { runAction } from '../core/action';
import { splitMaterials } from '../core/format';
import { useConnection } from '../state/useConnection';
import { useDraft } from '../state/useDraft';
import { useSelection } from '../state/useSelection';
import { usePanels } from '../state/usePanels';
import { useActions } from '../state/useActions';
import { readRoute, type AppRoute, type MethodTab } from './navigation';

/**
 * 工作区组合根：连接、草稿、选择、面板、动作按依赖顺序组合，
 * 返回形状即各组件依赖的 WorkspaceController。
 */
export function useWorkspace(
  route: AppRoute,
  navigate: (route: AppRoute, replace?: boolean) => void,
) {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const connection = useConnection(setError, route.kind === 'method');
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
  const panels = usePanels(connection.workId);
  useEffect(() => {
    if (!connection.workId) panels.setLibraryOpen(true);
  }, [connection.workId, panels.setLibraryOpen]);
  const actions = useActions({
    setBusy,
    setError,
    setNotice,
    workId: connection.workId,
    activeWorkId: connection.activeWorkId,
    receive: connection.receive,
    work: connection.work,
    snapshot: connection.snapshot,
    definition: draft.definition,
    definitionRef: draft.definitionRef,
    baseId: draft.baseId,
    setDirty: draft.setDirty,
    setLocalDefinition: draft.setLocalDefinition,
    editDefinition: draft.editDefinition,
    selectedNode: selection.selectedNode,
    selectedDefinitionId: selection.selectedDefinitionId,
    inputs: selection.inputs,
    selectedMaterials: selection.selectedMaterials,
    selectedResults: selection.selectedResults,
    inputMode: selection.inputMode,
    setInputMode: selection.setInputMode,
    sampleSource: selection.sampleSource,
    setSampleSource: selection.setSampleSource,
    setSelectedNode: selection.setSelectedNode,
    setSelectedRun: selection.setSelectedRun,
    setPreviewInputs: selection.setPreviewInputs,
    setPanel: panels.setPanel,
    setTab,
    setTrialOpen: panels.setTrialOpen,
    setCandidateSource: panels.setCandidateSource,
    setSourceChoice: panels.setSourceChoice,
    setReplaceDraft: panels.setReplaceDraft,
    addKind: panels.addKind,
  });
  function openWork(id: string, updateLocation = true) {
    if (updateLocation) {
      const current = readRoute(new URL(window.location.href));
      navigate({
        kind: 'method',
        id,
        tab: 'canvas',
        ...(current.kind === 'method'
          ? { fromItem: current.fromItem, fromTab: current.fromTab }
          : {}),
      });
    }
    panels.setLibraryOpen(false);
    setError('');
    setNotice('');
    if (id === connection.workId) {
      connection.refetch(id);
      return;
    }
    selection.flushContext();
    connection.switchTo(id);
    setBusy(false);
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
    selection.flushContext();
    connection.switchTo(next?.id || '');
    setBusy(false);
    draft.resetDraft();
    selection.resetSelection();
    panels.setTab('canvas');
    if (!next) panels.setLibraryOpen(true);
    if (route.kind === 'method' && route.id === id) {
      navigate(
        next
          ? { kind: 'method', id: next.id, tab: 'canvas' }
          : { kind: 'methods' },
        true,
      );
    }
    setError('');
    setNotice('');
  }
  // Browser traversal selects saved objects only; it never replays an action.
  useEffect(() => {
    if (route.kind === 'method') {
      openWork(route.id, false);
      panels.setTab(route.tab || 'canvas');
    } else if (route.kind === 'methods') panels.setLibraryOpen(true);
  }, [route]);
  useEffect(() => {
    if (
      route.kind === 'method' &&
      route.runId &&
      connection.work?.id === route.id
    )
      selection.setSelectedRun(route.runId);
  }, [route, connection.work?.id]);
  function setTab(next: MethodTab) {
    if (connection.activeWorkId.current !== connection.workId) return;
    panels.setTab(next);
    const current = readRoute(new URL(window.location.href));
    if (current.kind === 'method' && current.id === connection.workId)
      navigate({
        ...current,
        tab: next,
        runId: next === 'results' ? current.runId : undefined,
        resultView: next === 'results' ? current.resultView : undefined,
      });
  }
  function setSelectedRun(next: React.SetStateAction<string | undefined>) {
    if (connection.activeWorkId.current !== connection.workId) return;
    const id = typeof next === 'function' ? next(selection.selectedRun) : next;
    selection.setSelectedRun(id);
    const current = readRoute(new URL(window.location.href));
    if (
      current.kind === 'method' &&
      current.id === connection.workId &&
      current.tab === 'results' &&
      id
    )
      navigate({ ...current, runId: id });
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
    notice,
    setNotice,
    busy,
    ...connection,
    ...draft,
    ...selection,
    ...panels,
    setTab,
    setSelectedRun,
    ...actions,
    openWork,
    closeWork,
    create,
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
