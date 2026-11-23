import type {
  Definition,
  FlowNode,
  Inputs,
  NodeResult,
  Snapshot,
  Work,
  RunSampleSource,
} from '../../shared/records';
import { api } from '../core/api';
import { runAction } from '../core/action';
import { newId } from '../core/format';
import { materialInputs } from '../core/inputs';

interface ActionDeps {
  setBusy: (busy: boolean) => void;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  workId: string;
  activeWorkId: React.RefObject<string>;
  receive: (snapshot: Snapshot) => void;
  work: Work | undefined;
  snapshot: Snapshot | null;
  definition: Definition;
  definitionRef: React.RefObject<Definition>;
  baseId: React.RefObject<string | undefined>;
  setDirty: (dirty: boolean) => void;
  setLocalDefinition: (definition: Definition | null) => void;
  editDefinition: (definition: Definition) => void;
  selectedNode: string | undefined;
  selectedDefinitionId: string | undefined;
  inputs: Inputs;
  selectedMaterials: string[];
  selectedResults: string[];
  inputMode: 'materials' | 'results' | 'run';
  setInputMode: (mode: 'materials' | 'results' | 'run') => void;
  sampleSource?: RunSampleSource;
  setSampleSource: (source: RunSampleSource | undefined) => void;
  setSelectedNode: (node: string | undefined) => void;
  setSelectedRun: (run: string | undefined) => void;
  setPreviewInputs: (inputs: Inputs | null) => void;
  setPanel: (panel: 'inspector' | 'assistant' | null) => void;
  setTab: (tab: 'canvas' | 'results' | 'compare') => void;
  setTrialOpen: (open: boolean) => void;
  setCandidateSource: (source: string | undefined) => void;
  setSourceChoice: (choice: string) => void;
  setReplaceDraft: (replace: boolean) => void;
  addKind: FlowNode['kind'];
}

/** 服务端动作：保存/运行/试验/比较/对话与画布节点添加。 */
export function useActions(deps: ActionDeps) {
  const {
    setBusy,
    setError,
    setNotice,
    workId,
    activeWorkId,
    receive,
    work,
    snapshot,
    definition,
    definitionRef,
    baseId,
    setDirty,
    setLocalDefinition,
    editDefinition,
    selectedNode,
    selectedDefinitionId,
    inputs,
    selectedMaterials,
    selectedResults,
    inputMode,
    setInputMode,
    sampleSource,
    setSampleSource,
    setSelectedNode,
    setSelectedRun,
    setPreviewInputs,
    setPanel,
    setTab,
    setTrialOpen,
    setCandidateSource,
    setSourceChoice,
    setReplaceDraft,
    addKind,
  } = deps;
  async function action(
    actionName: string,
    fields: Record<string, unknown> = {},
  ) {
    if (!workId) throw new Error('请先创建工作');
    const next = await api<Snapshot>(`/api/works/${workId}/actions`, {
      action: actionName,
      ...(actionName === 'edit' && inputMode === 'run' ? { sampleSource } : {}),
      ...fields,
    });
    if (activeWorkId.current === workId) receive(next);
    return next;
  }
  async function perform(
    actionName: string,
    fields: Record<string, unknown> = {},
  ) {
    const result = await runAction(() => action(actionName, fields), {
      setBusy: (value) => {
        if (activeWorkId.current === workId) setBusy(value);
      },
      setError: (value) => {
        if (activeWorkId.current === workId) setError(value);
      },
    });
    return activeWorkId.current === workId ? result : undefined;
  }
  async function saveDefinition() {
    const next = await perform('saveDraft', {
      expectedDraftId: baseId.current,
      definition,
    });
    if (next && activeWorkId.current === workId) {
      baseId.current = next.work.draftId;
      // Saving an earlier edit cannot discard a newer local edit.
      if (definitionRef.current === definition) {
        setDirty(false);
        setLocalDefinition(next.definitions[next.work.draftId!]);
      }
    }
    return next;
  }
  async function generate() {
    await perform('edit', {
      text: `请根据本次工作目标和材料生成可运行的流程：${work?.goal}。节点名称、任务和最终产物要对应目标；输出引用材料编号。`,
      expectedDraftId: work?.draftId,
    });
    if (activeWorkId.current === workId) setPanel('assistant');
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
    if (next && activeWorkId.current === workId) {
      setSelectedRun(next.work.runs[next.work.runs.length - 1]?.id);
      setTab('results');
    }
  }
  /** 直接输入调用：裸值走 invoke 端点，同步等待终态；loose 为显式豁免。 */
  async function invokeWork(inputs: Record<string, unknown[]>, loose: boolean) {
    if (!workId) throw new Error('请先创建工作');
    if (!selectedDefinitionId) throw new Error('没有可调用的做法版本。');
    const result = await api<{
      runId: string;
      status: string;
      error?: string;
    }>(`/api/works/${workId}/invoke`, {
      inputs,
      definition: selectedDefinitionId,
      wait: true,
      ...(loose ? { mode: 'loose' } : {}),
    });
    const next = await api<Snapshot>(`/api/works/${workId}`, undefined, 'GET');
    if (activeWorkId.current === workId) {
      receive(next);
      setSelectedRun(result.runId);
      setTab('results');
      if (result.status === 'running')
        setNotice('仍在运行：已切到运行结果页，进展会实时更新。');
    }
    return result;
  }
  function prepareResultInputs() {
    return runAction(
      async () => {
        const data = await api<{ inputs: Inputs }>(
          `/api/works/${workId}/preview-results`,
          { resultIds: selectedResults },
        );
        if (activeWorkId.current === workId) setPreviewInputs(data.inputs);
        return data.inputs;
      },
      {
        setError: (value) => {
          if (activeWorkId.current === workId) setError(value);
        },
      },
    );
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
            sampleSource: inputMode === 'run' ? sampleSource : undefined,
          }
        : {
            definitionId: work.draftId,
            scope: { nodeId: selectedNode },
            inputs,
            sampleSource: inputMode === 'run' ? sampleSource : undefined,
          },
    );
    if (result && activeWorkId.current === workId) {
      setTrialOpen(false);
      setSelectedRun(result.work.runs[result.work.runs.length - 1]?.id);
      setTab(compare ? 'compare' : 'results');
    }
  }
  async function beginFrom(result: NodeResult) {
    const original = work?.runs
      .find((run) => run.id === result.runId)
      ?.results.find((entry) => entry.id === result.id);
    if (original?.nodeId === result.nodeId) {
      setSampleSource({ runId: result.runId, resultIds: [result.id] });
      setInputMode('run');
    }
    setCandidateSource(result.definitionId);
    setSourceChoice(result.definitionId);
    setReplaceDraft(false);
    setSelectedNode(result.nodeId);
  }
  function addNode() {
    const node: FlowNode = {
      id: newId(),
      kind: addKind,
      label:
        addKind === 'create-items'
          ? '建立子项'
          : addKind === 'dynamic'
            ? '局部动态展开'
            : addKind === 'file'
              ? '文件'
              : addKind === 'agent'
                ? '新的 Agent 步骤'
                : addKind === 'branch'
                  ? '条件分流'
                  : addKind === 'wait'
                    ? '等待外部事件'
                    : addKind === 'milestone'
                      ? '记录业务进展'
                      : '整理数据',

      operation: 'map',
      ...(addKind === 'create-items'
        ? { operation: 'aggregate' as const }
        : addKind === 'dynamic'
          ? {
              operation: 'aggregate' as const,
              task: '',
              contract: { responsibility: '', done: '', rationale: '' },
              dynamic: { boundary: '', maxNodes: 5 },
            }
          : addKind === 'file'
            ? { file: { name: '' } }
            : addKind === 'agent'
              ? { task: '' }
              : addKind === 'function'
                ? { functionName: 'identity' as const }
                : addKind === 'wait'
                  ? {
                      wait: { event: 'update', reason: '等待补充信息' },
                    }
                  : addKind === 'milestone'
                    ? {
                        milestone: { stage: '', summary: '' },
                      }
                    : {
                        condition: { field: '', operator: 'equals' as const },
                      }),
    };
    editDefinition({ ...definition, nodes: [...definition.nodes, node] });
    setSelectedNode(node.id);
    setPanel('inspector');
  }
  return {
    action,
    perform,
    saveDefinition,
    generate,
    runFull,
    invokeWork,
    prepareResultInputs,
    trial,
    beginFrom,
    addNode,
  };
}
