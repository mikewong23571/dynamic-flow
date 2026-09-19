import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  Definition,
  FlowNode,
  Inputs,
  NodeResult,
  Snapshot,
  Work,
  ModelConfiguration,
  WorkSummary,
  WorkPage,
} from '../shared/records';
import {
  acceptSnapshot,
  api,
  changeSummary,
  materialInputs,
  splitMaterials,
  localInputs,
} from './model';

const emptyDefinition: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [],
  edges: [],
  outputs: {},
};
type WorkList = WorkSummary[];
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
export function useWorkspace() {
  const [works, setWorks] = useState<WorkList>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const activeWorkId = useRef('');
  const contextForWork = useRef('');
  const [assistantDraft, setAssistantDraft] = useState('');
  const [workId, setWorkId] = useState(
    () => localStorage.getItem('dynamic-flow.work') || '',
  );
  const [configuration, setConfiguration] = useState<ModelConfiguration | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(
    !localStorage.getItem('dynamic-flow.work'),
  );
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [goal, setGoal] = useState(
    () => localStorage.getItem('dynamic-flow.goal') || '',
  );
  const [materialText, setMaterialText] = useState(
    () => localStorage.getItem('dynamic-flow.materials') || '',
  );
  const [addOpen, setAddOpen] = useState(false);
  const [newMaterials, setNewMaterials] = useState('');
  const [selectedNode, setSelectedNode] = useState<string>();
  const [panel, setPanel] = useState<'inspector' | 'assistant' | null>(
    'assistant',
  );
  const [tab, setTab] = useState<'canvas' | 'results' | 'compare'>('canvas');
  const [localDefinition, setLocalDefinition] = useState<Definition | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);
  const baseId = useRef<string | undefined>(undefined);
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
  const [selectedResults, setSelectedResults] = useState<string[]>([]);
  const [previewInputs, setPreviewInputs] = useState<Inputs | null>(null);
  const [trialOpen, setTrialOpen] = useState(false);
  const [continueOpen, setContinueOpen] = useState(false);
  const [continueNode, setContinueNode] = useState('');
  const [candidateSource, setCandidateSource] = useState<string>();
  const [sourceChoice, setSourceChoice] = useState('');
  const [replaceDraft, setReplaceDraft] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [addKind, setAddKind] = useState<FlowNode['kind']>('function');
  const work = snapshot?.work;
  const definition =
    localDefinition ||
    snapshot?.definitions[work?.draftId || work?.adoptedId || ''] ||
    emptyDefinition;
  const selected = definition.nodes.find((n) => n.id === selectedNode);
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
  const receive = useCallback((next: Snapshot) => {
    setSnapshot((prev) => {
      const accepted = acceptSnapshot(prev, next);
      snapshotRef.current = accepted;
      return accepted;
    });
  }, []);
  useEffect(() => {
    void api<WorkPage>('/api/works?page=1&pageSize=12')
      .then((r) => setWorks(r.works.slice(0, 12)))
      .catch((e) => setError(String(e)));
    void api<ModelConfiguration>('/api/config')
      .then(setConfiguration)
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    localStorage.setItem('dynamic-flow.goal', goal);
  }, [goal]);
  useEffect(() => {
    localStorage.setItem('dynamic-flow.materials', materialText);
  }, [materialText]);
  useEffect(() => {
    if (!workId) return;
    activeWorkId.current = workId;
    let alive = true;
    setConnected(false);
    void api<Snapshot>(`/api/works/${workId}`)
      .then((s) => {
        if (alive) receive(s);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    const events = new EventSource(`/api/works/${workId}/events`);
    events.addEventListener('snapshot', (event) => {
      if (alive) {
        try {
          receive(JSON.parse((event as MessageEvent).data));
          setConnected(true);
        } catch {
          setError('状态更新无法读取，请重新打开工作。');
        }
      }
    });
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    localStorage.setItem('dynamic-flow.work', workId);
    return () => {
      alive = false;
      events.close();
    };
  }, [workId, receive]);
  useEffect(() => {
    if (!work) return;
    setWorks((prev) =>
      work.archivedAt
        ? prev.filter((w) => w.id !== work.id)
        : [
            {
              id: work.id,
              title: work.title,
              goal: work.goal,
              updatedAt: work.updatedAt,
            },
            ...prev.filter((w) => w.id !== work.id),
          ].slice(0, 12),
    );
    if (!dirty) {
      baseId.current = work.draftId;
      setLocalDefinition(
        snapshot?.definitions[work.draftId || work.adoptedId || ''] || null,
      );
    }
  }, [snapshot, dirty]);
  useEffect(() => {
    if (selectedNode && !definition.nodes.some((n) => n.id === selectedNode))
      setSelectedNode(undefined);
  }, [definition, selectedNode]);
  useEffect(() => {
    setPreviewInputs(null);
  }, [selectedResults]);
  useEffect(() => {
    if (!work) return;
    const storageKey = `dynamic-flow.context.${work.id}`;
    if (contextForWork.current !== work.id) {
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
        setLocalDefinition(saved.pendingDraft.definition);
        baseId.current = saved.pendingDraft.baseId;
        setDirty(true);
      }
      return;
    }
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        selectedMaterials,
        sampleSelection,
        selectedNode,
        selectedRun,
        selectedResults,
        inputMode,
        samplePort,
        assistantDraft,
        pendingDraft: dirty
          ? { definition: localDefinition, baseId: baseId.current }
          : undefined,
      }),
    );
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
    dirty,
    localDefinition,
  ]);
  function refreshWorks() {
    void api<WorkPage>('/api/works?page=1&pageSize=12')
      .then((page) => setWorks(page.works.slice(0, 12)))
      .catch((error) => setError(String(error)));
  }
  async function action(
    actionName: string,
    fields: Record<string, unknown> = {},
  ) {
    if (!workId) throw new Error('请先创建工作');
    const next = await api<Snapshot>(`/api/works/${workId}/actions`, {
      action: actionName,
      ...fields,
    });
    if (activeWorkId.current === workId) receive(next);
    return next;
  }
  async function perform(
    actionName: string,
    fields: Record<string, unknown> = {},
  ) {
    setBusy(true);
    setError('');
    try {
      return await action(actionName, fields);
    } catch (e) {
      setError(String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  function openWork(id: string) {
    setLibraryOpen(false);
    activeWorkId.current = id;
    if (id === workId) {
      // Re-entering the current work must retain its snapshot and local edits.
      // The workId effect will not run again, so refresh metadata explicitly.
      setError('');
      void api<Snapshot>(`/api/works/${id}`)
        .then((next) => {
          if (activeWorkId.current === id) receive(next);
        })
        .catch((error) => {
          if (activeWorkId.current === id) setError(String(error));
        });
      return;
    }
    setWorkId(id);
    setSnapshot(null);
    snapshotRef.current = null;
    setDirty(false);
    setLocalDefinition(null);
    setSelectedNode(undefined);
    setSelectedRun(undefined);
    setSelectedResults([]);
    setSampleSelection({});
    setSelectedMaterials([]);
    setTab('canvas');
    setError('');
  }
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
      const saved = JSON.parse(
        localStorage.getItem(key) || '{}',
      ) as LocalContext;
      delete saved.pendingDraft;
      localStorage.setItem(key, JSON.stringify(saved));
    } catch {
      localStorage.removeItem(key);
    }
  }
  async function saveDefinition() {
    const next = await perform('saveDraft', {
      expectedDraftId: baseId.current,
      definition,
    });
    if (next) {
      baseId.current = next.work.draftId;
      setDirty(false);
      setLocalDefinition(next.definitions[next.work.draftId!]);
    }
    return next;
  }
  async function create() {
    if (!goal.trim() || splitMaterials(materialText).length === 0) {
      setError(!goal.trim() ? '请填写工作目标。' : '请粘贴至少一条材料。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await api<Snapshot>('/api/works', {
        goal: goal.trim(),
        materials: splitMaterials(materialText),
      });
      openWork(next.work.id);
      receive(next);
      setCreateOpen(false);
      setLibraryRevision((v) => v + 1);
      setGoal('');
      setMaterialText('');
      setSelectedMaterials(next.work.materials.map((m) => m.id));
      setPanel('assistant');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    await perform('edit', {
      text: `请根据本次工作目标和材料生成可运行的流程：${work?.goal}。节点名称、任务和最终产物要对应目标；输出引用材料编号。`,
      expectedDraftId: work?.draftId,
    });
    setPanel('assistant');
  }
  async function runFull() {
    if (!work || !selectedDefinitionId) return;
    const def = snapshot?.definitions[selectedDefinitionId];
    if (!def) return;
    const next = await perform('run', {
      definitionId: selectedDefinitionId,
      scope: 'full',
      inputs: materialInputs(work, selectedMaterials, def.inputs[0]),
    });
    if (next) {
      setSelectedRun(next.work.runs[next.work.runs.length - 1]?.id);
      setTab('results');
    }
  }
  async function prepareResultInputs() {
    try {
      setError('');
      const data = await api<{ inputs: Inputs }>(
        `/api/works/${workId}/preview-results`,
        { resultIds: selectedResults },
      );
      setPreviewInputs(data.inputs);
      return data.inputs;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }
  async function trial(compare = false) {
    if (!selectedNode || !work?.draftId) return;
    const result = await perform(
      compare ? 'compare' : 'run',
      compare
        ? {
            baselineId: work.draftBaseId || work.adoptedId,
            candidateId: work.draftId,
            nodeId: selectedNode,
            inputs,
          }
        : {
            definitionId: work.draftId,
            scope: { nodeId: selectedNode },
            inputs,
          },
    );
    if (result) {
      setTrialOpen(false);
      setSelectedRun(result.work.runs[result.work.runs.length - 1]?.id);
      setTab(compare ? 'compare' : 'results');
    }
  }
  function beginFrom(result: NodeResult) {
    setCandidateSource(result.definitionId);
    setSourceChoice(result.definitionId);
    setReplaceDraft(false);
    setSelectedNode(result.nodeId);
  }
  function addNode() {
    const node: FlowNode = {
      id: crypto.randomUUID(),
      kind: addKind,
      label:
        addKind === 'agent'
          ? '新的 AI 步骤'
          : addKind === 'branch'
            ? '条件分流'
            : '整理数据',
      mode: 'each',
      ...(addKind === 'agent'
        ? { task: '' }
        : addKind === 'function'
          ? { functionName: 'identity' as const }
          : { condition: { field: '', operator: 'equals' as const } }),
    };
    editDefinition({ ...definition, nodes: [...definition.nodes, node] });
    setSelectedNode(node.id);
    setPanel('inspector');
  }
  const changes = changeSummary(
    snapshot?.definitions[work?.draftBaseId || work?.adoptedId || ''],
    definition,
  );
  return {
    refreshWorks,
    settingsOpen,
    setSettingsOpen,
    setConfiguration,
    libraryOpen,
    setLibraryOpen,
    libraryRevision,
    assistantDraft,
    setAssistantDraft,
    executionDefinition,
    inputs,
    works,
    snapshot,
    workId,
    configuration,
    connected,
    error,
    setError,
    busy,
    createOpen,
    setCreateOpen,
    goal,
    setGoal,
    materialText,
    setMaterialText,
    addOpen,
    setAddOpen,
    newMaterials,
    setNewMaterials,
    selectedNode,
    setSelectedNode,
    panel,
    setPanel,
    tab,
    setTab,
    setLocalDefinition,
    dirty,
    setDirty,
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
    trialOpen,
    setTrialOpen,
    continueOpen,
    setContinueOpen,
    continueNode,
    setContinueNode,
    candidateSource,
    setCandidateSource,
    sourceChoice,
    setSourceChoice,
    replaceDraft,
    setReplaceDraft,
    codeOpen,
    setCodeOpen,
    addKind,
    setAddKind,
    baseId,
    work,
    definition,
    selected,
    selectedDefinitionId,
    selectedNodeSamples,
    currentRun,
    comparison,
    changes,
    action,
    perform,
    openWork,
    editDefinition,
    saveDefinition,
    discardLocalChanges,
    create,
    generate,
    runFull,
    prepareResultInputs,
    trial,
    beginFrom,
    addNode,
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
