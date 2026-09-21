import { useCallback, useEffect, useRef, useState } from 'react';
import type { Definition, Inputs, Snapshot, Work } from '../../shared/records';
import { localInputs, materialInputs, inputPorts } from '../core/inputs';

interface LocalContext {
  selectedMaterials?: string[];
  sampleSelection?: Record<string, string[]>;
  selectedNode?: string;
  selectedRun?: string;
  selectedResults?: string[];
  inputMode?: 'materials' | 'results';
  samplePort?: string;
  assistantDraft?: string;
  pendingDraft?: { definition: Definition; baseId?: string };
}

interface DraftState {
  dirty: boolean;
  localDefinition: Definition | null;
  baseId: React.RefObject<string | undefined>;
  setLocalDefinition: (definition: Definition | null) => void;
  setDirty: (dirty: boolean) => void;
}

/** 画布/材料/样本/运行选择与每工作上下文（localStorage）恢复。 */
export function useSelection(
  snapshot: Snapshot | null,
  work: Work | undefined,
  definition: Definition,
  draft: DraftState,
) {
  const [selectedNode, setSelectedNode] = useState<string>();
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [sampleSelection, setSampleSelection] = useState<
    Record<string, string[]>
  >({});
  const [inputMode, setInputMode] = useState<'materials' | 'results'>(
    'materials',
  );
  const [samplePort, setSamplePort] = useState('input');
  const [runDefinition, setRunDefinition] = useState<'adopted' | 'draft'>(
    'adopted',
  );
  const [selectedRun, setSelectedRun] = useState<string>();
  const [selectedResults, setSelectedResultsState] = useState<string[]>([]);
  const [previewInputs, setPreviewInputs] = useState<Inputs | null>(null);
  const [assistantDraft, setAssistantDraft] = useState('');
  const contextForWork = useRef('');
  const pendingContext = useRef<{ key: string; value: LocalContext } | null>(
    null,
  );
  const contextTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flushContext = useCallback(() => {
    if (contextTimer.current) {
      clearTimeout(contextTimer.current);
      contextTimer.current = undefined;
    }
    const pending = pendingContext.current;
    pendingContext.current = null;
    if (pending)
      localStorage.setItem(pending.key, JSON.stringify(pending.value));
  }, []);
  useEffect(() => {
    window.addEventListener('pagehide', flushContext);
    return () => {
      window.removeEventListener('pagehide', flushContext);
      flushContext();
    };
  }, [flushContext]);
  const selected = definition.nodes.find((n) => n.id === selectedNode);
  useEffect(() => {
    if (selected && !inputPorts(selected).includes(samplePort))
      setSamplePort(inputPorts(selected)[0] || 'input');
  }, [selected, samplePort]);
  const defaultId = work?.adoptedId || work?.draftId;
  const selectedDefinitionId =
    runDefinition === 'draft' ? work?.draftId : defaultId;
  const executionDefinition =
    snapshot?.definitions[selectedDefinitionId || ''] || definition;
  const selectedNodeSamples = selectedNode
    ? (sampleSelection[selectedNode] ?? selectedMaterials)
    : selectedMaterials;
  const inputs = localInputs(
    selected,
    inputMode === 'results'
      ? previewInputs || {}
      : work
        ? materialInputs(work, selectedNodeSamples)
        : {},
    samplePort,
  );
  const currentRun =
    work?.runs.find((r) => r.id === selectedRun) ||
    work?.runs[work.runs.length - 1];
  const comparison = [...(work?.comparisons || [])]
    .reverse()
    .find((c) => !selectedNode || c.nodeId === selectedNode);
  useEffect(() => {
    if (selectedNode && !definition.nodes.some((n) => n.id === selectedNode))
      setSelectedNode(undefined);
  }, [definition, selectedNode]);
  function setSelectedResults(next: React.SetStateAction<string[]>) {
    setSelectedResultsState(next);
    setPreviewInputs(null);
  }
  useEffect(() => {
    if (!work) return;
    const storageKey = `dynamic-flow.context.${work.id}`;
    if (contextForWork.current !== work.id) {
      flushContext();
      contextForWork.current = work.id;
      let saved: LocalContext = {};
      try {
        saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      } catch {
        /* An older invalid view does not prevent opening the work. */
      }
      setSelectedMaterials(
        saved.selectedMaterials || work.materials.map((m) => m.id),
      );
      setSampleSelection(saved.sampleSelection || {});
      setSelectedNode(saved.selectedNode);
      setSelectedRun(saved.selectedRun);
      setSelectedResults(saved.selectedResults || []);
      setInputMode(saved.inputMode || 'materials');
      setSamplePort(saved.samplePort || 'input');
      setAssistantDraft(saved.assistantDraft || '');
      if (saved.pendingDraft) {
        draft.setLocalDefinition(saved.pendingDraft.definition);
        draft.baseId.current = saved.pendingDraft.baseId;
        draft.setDirty(true);
      }
      return;
    }
    pendingContext.current = {
      key: storageKey,
      value: {
        selectedMaterials,
        sampleSelection,
        selectedNode,
        selectedRun,
        selectedResults,
        inputMode,
        samplePort,
        assistantDraft,
        pendingDraft:
          draft.dirty && draft.localDefinition
            ? {
                definition: draft.localDefinition,
                baseId: draft.baseId.current,
              }
            : undefined,
      },
    };
    if (contextTimer.current) clearTimeout(contextTimer.current);
    contextTimer.current = setTimeout(flushContext, 400);
  }, [
    work?.id,
    selectedMaterials,
    sampleSelection,
    selectedNode,
    selectedRun,
    selectedResults,
    inputMode,
    samplePort,
    assistantDraft,
    draft.dirty,
    draft.localDefinition,
    flushContext,
  ]);
  function resetSelection() {
    flushContext();
    contextForWork.current = '';
    setSelectedNode(undefined);
    setSelectedRun(undefined);
    setSelectedResults([]);
    setSampleSelection({});
    setSelectedMaterials([]);
  }
  return {
    selectedNode,
    setSelectedNode,
    selectedMaterials,
    setSelectedMaterials,
    setSampleSelection,
    inputMode,
    setInputMode,
    samplePort,
    setSamplePort,
    runDefinition,
    setRunDefinition,
    selectedRun,
    setSelectedRun,
    selectedResults,
    setSelectedResults,
    previewInputs,
    setPreviewInputs,
    assistantDraft,
    setAssistantDraft,
    selected,
    selectedDefinitionId,
    executionDefinition,
    selectedNodeSamples,
    inputs,
    currentRun,
    comparison,
    resetSelection,
  };
}
