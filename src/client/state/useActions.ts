import type {
  Definition,
  FlowNode,
  Inputs,
  NodeResult,
  Snapshot,
  Work,
} from '../../shared/records';
import { api } from '../core/api';
import { runAction } from '../core/action';
import { newId } from '../core/format';
import { materialInputs } from '../core/inputs';

interface ActionDeps {
  setBusy: (busy: boolean) => void;
  setError: (error: string) => void;
  workId: string;
  activeWorkId: React.RefObject<string>;
  receive: (snapshot: Snapshot) => void;
  work: Work | undefined;
  snapshot: Snapshot | null;
  definition: Definition;
  baseId: React.RefObject<string | undefined>;
  setDirty: (dirty: boolean) => void;
  setLocalDefinition: (definition: Definition | null) => void;
  editDefinition: (definition: Definition) => void;
  selectedNode: string | undefined;
  selectedDefinitionId: string | undefined;
  inputs: Inputs;
  selectedMaterials: string[];
  selectedResults: string[];
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
    workId,
    activeWorkId,
    receive,
    work,
    snapshot,
    definition,
    baseId,
    setDirty,
    setLocalDefinition,
    editDefinition,
    selectedNode,
    selectedDefinitionId,
    inputs,
    selectedMaterials,
    selectedResults,
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
      ...fields,
    });
    if (activeWorkId.current === workId) receive(next);
    return next;
  }
  function perform(actionName: string, fields: Record<string, unknown> = {}) {
    return runAction(() => action(actionName, fields), { setBusy, setError });
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
  function prepareResultInputs() {
    return runAction(
      async () => {
        const data = await api<{ inputs: Inputs }>(
          `/api/works/${workId}/preview-results`,
          { resultIds: selectedResults },
        );
        setPreviewInputs(data.inputs);
        return data.inputs;
      },
      { setError },
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
      id: newId(),
      kind: addKind,
      label:
        addKind === 'file'
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
      mode: 'each',
      ...(addKind === 'file'
        ? { file: { name: '' } }
        : addKind === 'agent'
          ? { task: '' }
          : addKind === 'function'
            ? { functionName: 'identity' as const }
            : addKind === 'wait'
              ? {
                  mode: 'all' as const,
                  wait: { event: 'update', reason: '等待补充信息' },
                }
              : addKind === 'milestone'
                ? { mode: 'all' as const, milestone: { stage: '', summary: '' } }
                : { condition: { field: '', operator: 'equals' as const } }),
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
    prepareResultInputs,
    trial,
    beginFrom,
    addNode,
  };
}
