import { NativeSelect } from '../../components/ui/native-select';
import { OpenUIPreviewContext } from '../openui/OpenUIPreviewContext';
import type { DeliveryBrowserState } from './composition/delivery-browser-state';
import { parseOpenUIProgram, type OpenUIFocus } from '../../../shared/openui';
import { OpenUIWorkspace } from '../openui/OpenUIWorkspace';
import { RunInspector } from '../results/RunInspector';
import { UiArrangement } from './composition/UiArrangement';
import { RecordTools } from './composition/RecordTools';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Braces,
  Info,
  MoreHorizontal,
  Files,
  X,
  Workflow,
  Inbox,
  History,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import type {
  CompletionCriterion,
  Definition,
  Snapshot,
  ViewState,
  WorkItemView,
  WorkSummary,
  OutputReference,
  WorkItemSummary,
  WorkItemSummaryPage,
  ReceivedItemInput,
} from '../../../shared/records';

import { api } from '../../core/api';
import { active as isActive, errorText } from '../../core/format';
import { Badge, Modal } from '../../components/ui';
import { Button } from '../../components/ui/button';

import { Tabs, TabsContent } from '../../components/ui/tabs';
import {
  WorkspaceHeading,
  WorkspaceNavigation,
  WorkspaceTabList,
  WorkspaceTab,
  WorkspaceContent,
} from '../../components/WorkspaceFrame';
import { CompositionAssistant } from './composition/CompositionAssistant';
import {
  ContinueItemRecords,
  SaveItemMethod,
  SubmitItemEvent,
  CiteItemDelivery,
} from './composition/CompositionActionTasks';
import {
  CompositionAcceptanceTask,
  type AcceptanceDraft,
} from './composition/CompositionAcceptanceTask';
import { CompositionFlowTask } from './composition/CompositionFlowTask';
import { CompositionHistory } from './composition/CompositionHistory';
import { CompositionFlow } from './composition/CompositionFlow';
import { MethodPreview } from './composition/MethodPreview';
import {
  CompositionPlan,
  CompositionStep,
} from './composition/CompositionPlan';
import { NodeInspector } from '../inspector/NodeInspector';
import { CompositionInputs } from './composition/CompositionInputs';
import type { RunFocus } from '../results/run-inspector-model';
import type { ItemTab } from '../../app/navigation';
import './composition/CompositionWorkspace.css';
import { DeferredContent } from '../../components/DeferredContent';
import { itemStatusLabel } from './item-status';
import {
  useCompositionWorkspace,
  type WorkspaceSeed,
} from './composition/useCompositionWorkspace';
import type { RelationLocation } from './ItemRelations';
import { CompositionChildrenTask } from './composition/CompositionChildrenTask';
import { CandidateItems } from './CandidateItems';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';

export type ItemDetailState = {
  deliveries?: Record<string, DeliveryBrowserState>;
  tab: string;
  assistantText?: string;
  selected?: string;
  assistantOpen?: boolean;
  criteria?: CompletionCriterion[];
  criteriaBase?: string;
  relations?: RelationLocation;
  flowDraft?: { definition: Definition; baseId?: string };
  view?: ViewState;
  activeDelivery?: string;
  activeOutput?: string;
};
const emptyDefinition: Definition = {
  schemaVersion: 1,
  inputs: ['materials'],
  nodes: [],
  edges: [],
  outputs: {},
};
export function WorkItemDetail({
  item: initial,
  initialWorkspace,
  active = true,
  onChange,
  onRun,
  onMethod,
  onOpen,
  methods,
  state,
  onState,
  tabLocation,
  onTabLocation,
}: {
  item: WorkItemView;
  initialWorkspace?: WorkspaceSeed;
  active?: boolean;
  methods: WorkSummary[];
  onChange: (item: WorkItemView) => void;
  onRun: (ref: RunFocus) => void;
  onMethod: (id: string, authorText?: string) => void;
  onOpen: (id: string) => void;
  state?: ItemDetailState;
  tabLocation?: ItemTab;
  onTabLocation?: (tab: ItemTab) => void;
  onState: (state: ItemDetailState) => void;
}) {
  const { workspace, busy, error, setError, refresh, command, upload } =
    useCompositionWorkspace(initial, active, onChange, initialWorkspace);
  const activeRef = useRef(active);
  activeRef.current = active;
  const deliveryBrowserStates = useRef(
    state?.deliveries || ({} as Record<string, DeliveryBrowserState>),
  );
  const [tab, setTab] = useState(tabLocation || state?.tab || 'flow');
  useEffect(() => {
    if (!active) return;
    if (tabLocation) {
      setTab(tabLocation);
      setChosenTab(true);
    }
  }, [tabLocation, active]);
  const [editingFlow, setEditingFlow] = useState(false);
  const [editingUi, setEditingUi] = useState(false);
  const [uiDirty, setUiDirty] = useState(false);
  const [uiFocus, setUiFocus] = useState<OpenUIFocus>();
  useEffect(() => {
    if (
      uiFocus &&
      workspace?.uiProgram &&
      uiFocus.programId !== workspace.uiProgram.id
    ) {
      try {
        if (
          parseOpenUIProgram(workspace.uiProgram.source).statements.includes(
            uiFocus.block,
          )
        )
          setUiFocus({ ...uiFocus, programId: workspace.uiProgram.id });
        else setUiFocus(undefined);
      } catch {
        setUiFocus(undefined);
      }
    }
  }, [workspace?.uiProgram?.id]);
  const [chosenTab, setChosenTab] = useState(!!tabLocation || !!state?.tab);
  const [assistantOpen, setAssistantOpen] = useState(
    state?.assistantOpen ?? window.innerWidth >= 1280,
  );
  const [assistantText, setAssistantText] = useState(
    state?.assistantText || '',
  );
  const [selected, setSelected] = useState<string | undefined>(state?.selected);
  const [draft, setDraft] = useState<
    | {
        definition: Definition;
        baseId?: string;
      }
    | undefined
  >(state?.flowDraft);
  const [view, setView] = useState<ViewState | undefined>(state?.view);
  const [savingMethod, setSavingMethod] = useState(false);
  const [continuing, setContinuing] = useState<{
    deliveryId: string;
    recordIds: string[];
  }>();
  const [activeDelivery, setActiveDelivery] = useState<string | undefined>(
    state?.activeDelivery,
  );
  const [activeOutput, setActiveOutput] = useState<string | undefined>(
    state?.activeOutput,
  );
  const [accepting, setAccepting] = useState(false);
  const [acceptanceDraft, setAcceptanceDraft] = useState<AcceptanceDraft>(
    state || {},
  );
  const [details, setDetails] = useState(false);
  const [readingStep, setReadingStep] = useState<string>();
  const [assistantConversationId, setAssistantConversationId] =
    useState('main');
  const [readingMethod, setReadingMethod] = useState<{
    workId: string;
    definitionId: string;
  }>();
  const [childrenMode, setChildrenMode] = useState<'manage' | 'create'>();
  const [childCounts, setChildCounts] = useState<WorkItemSummary>();
  const [relations, setRelations] = useState<RelationLocation>(
    state?.relations || {
      view: 'children',
      query: '',
      page: 1,
      pageSize: 10,
      todo: '',
    },
  );
  const [citing, setCiting] = useState<OutputReference>();
  const [candidates, setCandidates] = useState<OutputReference>();
  const [childInput, setChildInput] = useState<Omit<ReceivedItemInput, 'id'>>();
  const [signalling, setSignalling] = useState<string>();
  const item = workspace?.item || initial;
  useEffect(() => {
    if (!active) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function pollChildren() {
      try {
        const page = await api<WorkItemSummaryPage>(
          `/api/items?summary=true&rootId=${initial.id}&view=children&pageSize=1`,
        );
        if (live)
          setChildCounts((previous) =>
            JSON.stringify(previous) === JSON.stringify(page.scopeSummary)
              ? previous
              : page.scopeSummary,
          );
      } catch (e) {
        if (live) setError(errorText(e));
      } finally {
        if (live) timer = setTimeout(() => void pollChildren(), 2000);
      }
    }
    void pollChildren();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [active, initial.id]);
  const snapshot = workspace?.work;
  const work = snapshot?.work;
  const saved = work?.draftId ? snapshot?.definitions[work.draftId] : undefined;
  const definition = draft?.definition || saved || emptyDefinition;
  const dirty =
    !!draft &&
    JSON.stringify(draft.definition) !==
      JSON.stringify(saved || emptyDefinition);
  const latestRun = work?.runs.at(-1);
  const publicationRun =
    latestRun?.status === 'completed' &&
    latestRun.effectMode === 'commit' &&
    latestRun.scope === 'full' &&
    !latestRun.comparisonId &&
    latestRun.definitionId === workspace?.uiProgram?.definitionId &&
    item.runs.some(
      (ref) => ref.runId === latestRun.id && ref.workId === work?.id,
    )
      ? latestRun
      : undefined;
  const flowRun = !dirty
    ? work?.runs.filter((run) => run.definitionId === work.draftId).at(-1)
    : undefined;
  const running = latestRun && isActive(latestRun.status);
  useEffect(() => {
    if (!chosenTab && (workspace?.uiProgram || workspace?.deliveries.length)) {
      setTab('results');
      setChosenTab(true);
    }
  }, [chosenTab, workspace?.deliveries.length, workspace?.uiProgram]);
  useEffect(() => {
    onState({
      deliveries: deliveryBrowserStates.current,
      tab,
      assistantText,
      assistantOpen,
      selected,
      ...acceptanceDraft,
      relations,
      flowDraft: draft,
      view,
      activeDelivery,
      activeOutput,
    });
  }, [
    tab,
    assistantText,
    assistantOpen,
    selected,
    acceptanceDraft,
    relations,
    draft,
    view,
    activeDelivery,
    activeOutput,
  ]);
  function openAcceptance() {
    setAccepting(true);
  }
  async function itemCommand(
    action: string,
    fields: Record<string, unknown> = {},
  ) {
    return (await command(action, fields)).item;
  }

  function safe(action: () => Promise<unknown>) {
    void action().catch(() => {});
  }
  function chooseTab(next: string) {
    if (!['results', 'flow', 'inputs', 'history'].includes(next)) return;
    setTab(next as ItemTab);
    if (activeRef.current) onTabLocation?.(next as ItemTab);
    setChosenTab(true);
  }
  async function saveFlow() {
    const pending = draft;
    const next = await command('saveFlow', {
      definition,
      expectedDraftId: pending ? pending.baseId : work?.draftId,
    });
    setDraft((current) =>
      current === pending
        ? undefined
        : current
          ? { ...current, baseId: next.work?.work.draftId }
          : current,
    );
  }
  async function requestAssistant(text: string) {
    setAssistantOpen(true);
    return command('assistant', {
      text,
      conversationId: assistantConversationId,
      expectedDraftId: work?.draftId,
      uiFocus,
    });
  }
  async function openSource(source: OutputReference) {
    try {
      const sourceWork =
        source.workId === work?.id
          ? snapshot
          : await api<Snapshot>(
              `/api/works/${source.workId}?runIds=${source.runId}`,
            );
      const run = sourceWork?.work.runs.find(
        (entry) => entry.id === source.runId,
      );
      if (!run) throw Error('来源运行无法读取');
      if (activeRef.current)
        onRun({ ...source, definitionId: run.definitionId });
    } catch (e) {
      setError(errorText(e));
    }
  }
  const deliveries = workspace?.deliveries || [];
  const outputTitles = useMemo(() => {
    try {
      return workspace?.uiProgram
        ? parseOpenUIProgram(workspace.uiProgram.source).outputTitles
        : {};
    } catch {
      return {};
    }
  }, [workspace?.uiProgram?.source]);
  const [processFocus, setProcessFocus] = useState<RunFocus>();
  const [processRootId, setProcessRootId] = useState<string>();
  const inspectedRun =
    work?.runs.find((run) => run.id === processRootId) || latestRun;
  async function publishCurrent() {
    if (!workspace?.uiProgram || !publicationRun) return;
    try {
      for (const output of parseOpenUIProgram(workspace.uiProgram.source)
        .outputs)
        await command('publishDelivery', {
          runId: publicationRun.id,
          output,
          programId: workspace.uiProgram.id,
        });
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  function editFlow(next: Definition) {
    setDraft({
      definition: next,
      baseId: draft ? draft.baseId : work?.draftId,
    });
  }
  function planFlow() {
    safe(() =>
      requestAssistant(
        '根据当前目标和材料，发现已有方法并保存可检查的处理定义和原生OpenUI业务界面；先规划，不正式运行。',
      ),
    );
  }
  const canPublishCurrent = Boolean(
    workspace?.uiProgram && publicationRun && Object.keys(outputTitles).length,
  );
  const currentRunPublished = Boolean(
    publicationRun &&
    deliveries.some(
      (d) =>
        d.runId === publicationRun.id &&
        d.uiProgramId === workspace?.uiProgram?.id,
    ),
  );
  return (
    <section className="composition-workspace" aria-label="工作项详情">
      <WorkspaceHeading
        title={item.title}
        eyebrow={`工作项 · ${item.key}`}
        description={item.goal}
        status={
          <Badge status={item.effectiveStatus}>{itemStatusLabel(item)}</Badge>
        }
        actions={
          <>
            {' '}
            {item.effectiveStatus === 'review' &&
              canPublishCurrent &&
              !currentRunPublished && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void publishCurrent()}
                >
                  保留本轮成果
                </Button>
              )}
            <Button variant="ghost" onClick={() => setDetails(true)}>
              <Info size={15} />
              目标
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" aria-label="工作项更多操作">
                  <MoreHorizontal size={17} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={
                    !saved?.nodes.length ||
                    busy ||
                    !!running ||
                    dirty ||
                    item.status === 'completed'
                  }
                  onSelect={() => safe(() => command('run'))}
                >
                  执行当前方案
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={
                    !workspace?.uiProgram ||
                    !publicationRun ||
                    !Object.keys(outputTitles).length ||
                    busy
                  }
                  onSelect={() => void publishCurrent()}
                >
                  保留本轮成果
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setChildrenMode('manage')}>
                  子工作项
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    chooseTab('flow');
                    setEditingFlow(true);
                    if (!work) safe(() => command('init'));
                  }}
                >
                  手工编辑流程
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!work || dirty || !saved?.nodes.length}
                  onSelect={() => {
                    setSavingMethod(true);
                  }}
                >
                  保存为流水线
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!workspace?.uiProgram}
                  onSelect={() => {
                    chooseTab('results');
                    setEditingUi(true);
                  }}
                >
                  界面安排
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!work}
                  onSelect={() => work && onMethod(work.id)}
                >
                  在方法工作区打开
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {error && (
        <div role="alert" className="composition-inline-error">
          <span>{error}</span>
          <Button
            variant="ghost"
            aria-label="关闭错误提示"
            onClick={() => setError('')}
          >
            <X size={14} />
          </Button>
        </div>
      )}
      <Tabs
        value={tab}
        onValueChange={chooseTab}
        className="workspace-view-tabs gap-0"
      >
        <WorkspaceNavigation
          actions={
            <>
              <Button
                variant={
                  item.effectiveStatus === 'review' ? 'outline' : 'ghost'
                }
                size="sm"
                onClick={openAcceptance}
              >
                完成条件{' '}
                <span className="meta-text">
                  {item.criteria.filter((c) => c.met).length}/
                  {item.criteria.length}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={
                  assistantOpen
                    ? '收起工作项 Assistant'
                    : '展开工作项 Assistant'
                }
                title={assistantOpen ? '收起侧栏' : '展开侧栏'}
                onClick={() => setAssistantOpen(!assistantOpen)}
              >
                {assistantOpen ? (
                  <PanelRightClose size={17} />
                ) : (
                  <PanelRightOpen size={17} />
                )}
              </Button>
            </>
          }
        >
          <WorkspaceTabList aria-label="工作项视图">
            <WorkspaceTab value="results">
              <Files size={15} />
              工作
            </WorkspaceTab>
            <WorkspaceTab value="flow">
              <Workflow size={15} />
              流程
            </WorkspaceTab>
            <WorkspaceTab value="inputs">
              <Inbox size={15} />
              输入
            </WorkspaceTab>
            <WorkspaceTab value="history">
              <History size={15} />
              记录
            </WorkspaceTab>
          </WorkspaceTabList>
        </WorkspaceNavigation>
        {item.blocker && (
          <div className="composition-blocker">
            <span>{item.blocker}</span>
            <Button variant="ghost" onClick={() => chooseTab('inputs')}>
              补充输入
            </Button>
          </div>
        )}
        <WorkspaceContent
          docked={!assistantOpen}
          panel={
            <OpenUIPreviewContext.Provider
              value={(program) =>
                workspace ? (
                  <OpenUIWorkspace
                    workspace={{
                      ...workspace,
                      uiProgram: program,
                      deliveries: workspace.deliveries.filter(
                        (delivery) => delivery.uiProgramId === program.id,
                      ),
                    }}
                    readonly
                    browserStates={{}}
                    onCommand={command}
                    onAssistant={requestAssistant}
                    onSource={(source) => void openSource(source)}
                    onReview={openAcceptance}
                    onContinue={() => {}}
                  />
                ) : null
              }
            >
              <CompositionAssistant
                item={item}
                workspace={workspace}
                definition={definition}
                selected={selected}
                expanded={assistantOpen}
                onExpanded={setAssistantOpen}
                text={assistantText}
                onText={setAssistantText}
                dirty={dirty}
                uiDirty={uiDirty}
                uiFocus={uiFocus}
                onClearUiFocus={() => setUiFocus(undefined)}
                onConversationChange={setAssistantConversationId}
                onMethodReference={setReadingMethod}
                inspector={
                  editingFlow && tab === 'flow' ? (
                    <NodeInspector
                      definition={definition}
                      nodeId={selected}
                      issues={snapshot?.issues || []}
                      methods={workspace?.methods || []}
                      onChange={editFlow}
                      onChat={() => {
                        setEditingFlow(false);
                        setAssistantOpen(true);
                      }}
                    />
                  ) : undefined
                }
                onCommand={command}
                onRefresh={refresh}
                onCanvas={(id) => {
                  chooseTab('flow');
                  setSelected(id);
                }}
              />
            </OpenUIPreviewContext.Provider>
          }
        >
          <TabsContent value="results" forceMount hidden={tab !== 'results'}>
            <DeferredContent active={tab === 'results'}>
              {() => (
                <>
                  {workspace && editingUi && workspace.uiProgram ? (
                    <UiArrangement
                      workspace={workspace}
                      initialBlock={uiFocus?.block}
                      busy={busy}
                      onClose={() => {
                        setEditingUi(false);
                        setUiDirty(false);
                      }}
                      onDirty={setUiDirty}
                      onFocus={(focus, open) => {
                        setUiFocus(focus);
                        if (open) setAssistantOpen(true);
                      }}
                      onSaved={(next, block) => {
                        setUiFocus({ programId: next.uiProgram!.id, block });
                      }}
                      onCommand={command}
                    />
                  ) : workspace ? (
                    <>
                      {item.execution &&
                        ['failed', 'interrupted'].includes(
                          item.execution.status,
                        ) && (
                          <div role="alert" className="inline-error">
                            {item.execution.error ||
                              (item.execution.status === 'failed'
                                ? '本次执行失败。'
                                : '本次执行已中断。')}
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setProcessRootId(item.execution!.runId);
                                chooseTab('flow');
                              }}
                            >
                              查看处理过程
                            </Button>
                          </div>
                        )}
                      {workspace.uiProgram ? (
                        <OpenUIWorkspace
                          workspace={workspace}
                          busy={busy}
                          browserStates={deliveryBrowserStates.current}
                          onCommand={command}
                          onAssistant={requestAssistant}
                          onSource={(source) => void openSource(source)}
                          onReview={openAcceptance}
                          onContinue={(deliveryId, recordIds) =>
                            setContinuing({ deliveryId, recordIds })
                          }
                        />
                      ) : (
                        <div className="composition-empty-task">
                          <Files size={28} />
                          <h2>尚无业务界面</h2>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              safe(() =>
                                requestAssistant(
                                  '检查真实材料、方法和本轮成果，保存适合本项目标的原生OpenUI业务界面；没有输出时如实保留缺口，不自动运行或确认条件。',
                                ),
                              )
                            }
                          >
                            请Assistant安排界面
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p>正在载入工作内容…</p>
                  )}
                </>
              )}
            </DeferredContent>
          </TabsContent>
          <TabsContent
            value="flow"
            className="composition-flow-tab"
            forceMount
            hidden={tab !== 'flow'}
          >
            <DeferredContent active={tab === 'flow'}>
              {() => (
                <>
                  {!!definition.nodes.length && !editingFlow && (
                    <CompositionPlan
                      definition={definition}
                      goal={item.goal}
                      outputTitles={outputTitles}
                      active={active}
                    />
                  )}
                  <CompositionFlowTask
                    item={item}
                    run={flowRun}
                    hasFlow={!!saved?.nodes.length}
                    dirty={dirty}
                    busy={busy}
                    planning={
                      !!work?.messages.some(
                        (message) =>
                          message.role === 'assistant' &&
                          message.status === 'running',
                      )
                    }
                    editing={editingFlow}
                    onEditing={() => {
                      setEditingFlow(!editingFlow);
                      if (!editingFlow) setAssistantOpen(true);
                    }}
                    onPlan={planFlow}
                    onRun={() =>
                      flowRun &&
                      work &&
                      onRun({
                        workId: work.id,
                        runId: flowRun.id,
                        definitionId: flowRun.definitionId,
                      })
                    }
                    onCommand={command}
                    onSignal={setSignalling}
                    onInputs={() => chooseTab('inputs')}
                  >
                    {work && (definition.nodes.length || editingFlow) ? (
                      <CompositionFlow
                        definition={definition}
                        onMethod={setReadingMethod}
                        onInspectNode={
                          flowRun && work
                            ? (nodeId) =>
                                onRun({
                                  workId: work.id,
                                  runId: flowRun.id,
                                  definitionId: flowRun.definitionId,
                                  nodeId,
                                })
                            : undefined
                        }
                        visible={active && tab === 'flow'}
                        outputTitles={outputTitles}
                        view={view || work.view}
                        run={flowRun}
                        issues={snapshot?.issues || []}
                        methods={[...(workspace?.methods || [])].sort(
                          (a, b) => Number(!!b.adopted) - Number(!!a.adopted),
                        )}
                        dirty={dirty}
                        busy={busy || !!running}
                        selected={selected}
                        editing={editingFlow}
                        onSelect={(id) => {
                          setSelected(id);
                          if (editingFlow && id) setAssistantOpen(true);
                          else if (
                            id &&
                            definition.nodes.some((node) => node.id === id)
                          )
                            setReadingStep(id);
                        }}
                        onChange={editFlow}
                        onLayout={(next) => {
                          setView(next);
                          void api(`/api/works/${work.id}/actions`, {
                            action: 'saveLayout',
                            view: next,
                          }).catch((e) => setError(errorText(e)));
                        }}
                        onSave={() => safe(saveFlow)}
                        onReset={() => setDraft(undefined)}
                      />
                    ) : null}
                  </CompositionFlowTask>
                  <section
                    aria-label="处理过程"
                    className="composition-process-panel"
                  >
                    <div className="composition-section-heading">
                      <h2>处理过程</h2>
                      {work && work.runs.length > 0 && (
                        <NativeSelect
                          aria-label="选择处理执行"
                          value={inspectedRun?.id || ''}
                          onChange={(event) => {
                            const run = work.runs.find(
                              (r) => r.id === event.target.value,
                            )!;
                            setProcessRootId(run.id);
                            setProcessFocus({
                              workId: work.id,
                              runId: run.id,
                              definitionId: run.definitionId,
                            });
                          }}
                        >
                          {[...work.runs].reverse().map((run) => (
                            <option key={run.id} value={run.id}>
                              {new Date(run.startedAt).toLocaleString()} ·{' '}
                              {run.status}
                            </option>
                          ))}
                        </NativeSelect>
                      )}
                    </div>
                    {snapshot && work && inspectedRun ? (
                      <RunInspector
                        snapshots={{ [work.id]: snapshot }}
                        focus={
                          processFocus || {
                            workId: work.id,
                            runId: inspectedRun.id,
                            definitionId: inspectedRun.definitionId,
                          }
                        }
                        rootFocus={{
                          workId: work.id,
                          runId: inspectedRun.id,
                          definitionId: inspectedRun.definitionId,
                        }}
                        onFocus={(next) => {
                          if (!processRootId && inspectedRun)
                            setProcessRootId(inspectedRun.id);
                          setProcessFocus(next);
                        }}
                        actions={(artifact, result, run) => {
                          const port =
                            artifact.source.port ??
                            Object.keys(result.outputs).find(
                              (port) => result.outputs[port].length,
                            );
                          const index = artifact.source.index ?? 0;
                          const source = port
                            ? {
                                ...artifact.source,
                                resultId: result.id,
                                port,
                                index,
                              }
                            : undefined;
                          const handoff = () => {
                            if (!source) return;
                            setChildInput({
                              label: '所选中间成果',
                              value:
                                result.outputs[source.port][source.index].value,
                              source,
                            });
                            setChildrenMode('create');
                          };
                          return (
                            <>
                              {result.status === 'completed' && source && (
                                <RecordTools
                                  hasSource
                                  busy={busy}
                                  canReviewCandidates
                                  compareDisabled={false}
                                  onSource={() => void openSource(source)}
                                  onCite={() => setCiting(source)}
                                  onCreateChild={handoff}
                                  onCandidates={() => setCandidates(source)}
                                  onCompare={() =>
                                    onMethod(artifact.source.workId)
                                  }
                                />
                              )}
                              {result.status === 'failed' && (
                                <Button
                                  onClick={() =>
                                    safe(() =>
                                      command('continueFailedInputs', {
                                        workId: artifact.source.workId,
                                        runId: run.id,
                                        resultIds: [result.id],
                                      }),
                                    )
                                  }
                                >
                                  正式补跑此失败输入
                                </Button>
                              )}
                            </>
                          );
                        }}
                      />
                    ) : (
                      <p className="meta-text">
                        尚未执行。处理定义、方法版本及输入可在上方检查。
                      </p>
                    )}
                  </section>
                </>
              )}
            </DeferredContent>
          </TabsContent>
          <TabsContent value="inputs" forceMount hidden={tab !== 'inputs'}>
            <DeferredContent active={tab === 'inputs'}>
              {() => (
                <>
                  <CompositionInputs
                    item={item}
                    uploads={workspace?.uploads || []}
                    definition={definition}
                    busy={busy}
                    onUpload={upload}
                    onAdd={(text) =>
                      itemCommand('addEvidence', { materials: [text] }).then(
                        () => {},
                      )
                    }
                    onInput={(fields) =>
                      command(
                        fields.inputId ? 'reviseInput' : 'addInput',
                        fields,
                      )
                    }
                    onSelect={(fields) => command('selectInputs', fields)}
                    onSource={(source) => void openSource(source)}
                    onChange={(next) => {
                      onChange(next);
                      safe(refresh);
                    }}
                  />
                </>
              )}
            </DeferredContent>
          </TabsContent>
          <TabsContent value="history" forceMount hidden={tab !== 'history'}>
            <DeferredContent active={tab === 'history'}>
              {() => (
                <>
                  <CompositionHistory
                    item={item}
                    snapshot={snapshot}
                    onRun={onRun}
                    onInputs={() => chooseTab('inputs')}
                  />
                </>
              )}
            </DeferredContent>
          </TabsContent>
        </WorkspaceContent>
      </Tabs>
      {active &&
        readingStep &&
        definition.nodes.some((node) => node.id === readingStep) && (
          <CompositionStep
            node={definition.nodes.find((node) => node.id === readingStep)!}
            definition={definition}
            outputTitles={outputTitles}
            method={workspace?.methods.find((method) => {
              const reference = definition.nodes.find(
                (node) => node.id === readingStep,
              )?.call;
              return (
                reference?.workId === method.workId &&
                reference.definitionId === method.definitionId
              );
            })}
            onMethod={() => {
              const reference = definition.nodes.find(
                (node) => node.id === readingStep,
              )?.call;
              if (reference) {
                setReadingStep(undefined);
                setReadingMethod(reference);
              }
            }}
            onClose={() => setReadingStep(undefined)}
            onImprove={() => {
              setAssistantText(
                `请根据当前目标、材料和处理关系，为“${definition.nodes.find((node) => node.id === readingStep)?.label}”补齐业务职责、完成产物和拆分依据；先保存规划，不正式执行。`,
              );
              setAssistantOpen(true);
              setReadingStep(undefined);
            }}
          />
        )}
      {active && readingMethod && (
        <MethodPreview
          key={`${readingMethod.workId}:${readingMethod.definitionId}`}
          reference={readingMethod}
          method={workspace?.methods.find(
            (method) =>
              method.workId === readingMethod.workId &&
              method.definitionId === readingMethod.definitionId,
          )}
          onClose={() => setReadingMethod(undefined)}
          onEdit={() => {
            setReadingMethod(undefined);
            onMethod(readingMethod.workId);
          }}
        />
      )}
      <Modal
        open={active && details}
        onOpenChange={setDetails}
        title="工作项目标"
      >
        <p className="meta-text">{item.key}</p>
        <p className="composition-goal-detail">{item.goal}</p>
        {item.summary && <p>{item.summary}</p>}
        {item.nextAction && <p>下一步：{item.nextAction}</p>}
      </Modal>
      <CompositionAcceptanceTask
        item={item}
        open={active && accepting}
        initialDraft={state}
        onDraft={setAcceptanceDraft}
        busy={busy}
        running={!!running}
        childCounts={childCounts}
        onClose={() => setAccepting(false)}
        onChildren={() => {
          setAccepting(false);
          setChildrenMode('manage');
        }}
        onCommand={itemCommand}
        onReference={onRun}
      />
      <CompositionChildrenTask
        item={item}
        methods={methods}
        snapshot={snapshot}
        mode={active ? childrenMode : undefined}
        onMode={(mode) => {
          setChildrenMode(mode);
          if (!mode) setChildInput(undefined);
        }}
        initialInput={childInput}
        location={relations}
        onLocation={setRelations}
        onOpen={onOpen}
        onMethod={onMethod}
        onChanged={refresh}
        onCounts={setChildCounts}
      />
      {active && candidates && (
        <CandidateItems
          item={item}
          source={{ ...candidates, kind: 'output' }}
          onClose={() => setCandidates(undefined)}
          onOpen={onOpen}
          onChanged={() => safe(refresh)}
        />
      )}
      {active && citing && (
        <CiteItemDelivery
          item={item}
          source={citing}
          onClose={() => setCiting(undefined)}
          onSaved={refresh}
          onConfigure={() => {
            setCiting(undefined);
            openAcceptance();
          }}
        />
      )}
      {active && signalling !== undefined && (
        <SubmitItemEvent
          itemId={item.id}
          eventName={signalling}
          onClose={() => setSignalling(undefined)}
          onSaved={refresh}
        />
      )}
      {active && continuing && (
        <ContinueItemRecords
          selection={continuing}
          methods={workspace?.methods || []}
          busy={busy}
          onClose={() => setContinuing(undefined)}
          onContinue={async (fields) => {
            await command('continueRecords', fields);
            chooseTab('inputs');
          }}
        />
      )}
      {active && savingMethod && (
        <SaveItemMethod
          title={item.title}
          busy={busy}
          onClose={() => setSavingMethod(false)}
          onSave={(title) => command('saveMethod', { title })}
        />
      )}
    </section>
  );
}
