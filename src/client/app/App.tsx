import type { RunFocus } from '../features/results/run-inspector-model';
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DeferredContent } from '../components/DeferredContent';
import { Tabs, TabsContent } from '../components/ui/tabs';
import { WorkspaceContent } from '../components/WorkspaceFrame';
import type {
  ModelSelection,
  Snapshot,
  WorkItemView,
} from '../../shared/records';
import { api } from '../core/api';
import { Results } from '../features/results/Results';
import { Comparison } from '../features/results/Comparison';
import WorkLibrary from '../features/library/WorkLibrary';
import { WorkItems } from '../features/work-items/WorkItems';
import { Sidebar } from '../features/workspace/Sidebar';
import { WorkspaceDialogs } from '../features/workspace/WorkspaceDialogs';
import { ModelSettingsDialog } from '../features/settings/ModelSettingsDialog';

import { useWorkspace } from './controller';
import { routeHref, useNavigation } from './navigation';
import { ObjectLink } from '../components/ObjectLink';
import { CandidateBar } from './CandidateBar';
import { CanvasPane } from './CanvasPane';
import { ContextPanel } from './ContextPanel';
import { Empty } from '../components/ui';
import { Button } from '../components/ui/button';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceNotices } from './WorkspaceNotices';
import { WorkspaceTabs } from './WorkspaceTabs';

// Inactive tabs retain their DOM and local state without consuming new snapshots.
// Work id keys discard retained views when changing methods; activation gets fresh props.
const WorkspaceTabPanel = memo(
  function WorkspaceTabPanel({
    active,
    value,
    children,
    className = 'workspace-tab-panel',
  }: {
    className?: string;
    value?: string;
    active: boolean;
    children: () => ReactNode;
  }) {
    if (value)
      return (
        <TabsContent
          value={value}
          forceMount
          className={className}
          hidden={!active}
        >
          <DeferredContent active={active}>{children}</DeferredContent>
        </TabsContent>
      );
    return (
      <div className={className} hidden={!active}>
        <DeferredContent active={active}>{children}</DeferredContent>
      </div>
    );
  },
  (previous, next) => !previous.active && !next.active,
);

/** 页面组装：侧栏、工作区（头部/标签/横幅/主内容/右面板/候选底栏）与全局对话框。 */
export default function Workspace() {
  const { route, navigate } = useNavigation();
  const itemsOpen = route.kind !== 'method' && route.kind !== 'methods';
  const [authorPrefill, setAuthorPrefill] = useState<{
    workId: string;
    text: string;
    onApplied: () => void;
  }>();
  const [pendingAuthor, setPendingAuthor] = useState<{
    workId: string;
    text: string;
  }>();
  const [pendingRun, setPendingRun] = useState<RunFocus>();
  const [requestedFocus, setRequestedFocus] = useState<RunFocus>();
  const [originItem, setOriginItem] = useState<WorkItemView>();
  const [originError, setOriginError] = useState('');
  const originId = route.kind === 'method' ? route.fromItem : undefined;
  useEffect(() => {
    setOriginItem(undefined);
    setOriginError('');
    if (!originId) return;
    let live = true;
    void api<WorkItemView>(`/api/items/${encodeURIComponent(originId)}`)
      .then((item) => {
        if (live) setOriginItem(item);
      })
      .catch((error) => {
        if (live) setOriginError(String(error));
      });
    return () => {
      live = false;
    };
  }, [originId]);
  const controller = useWorkspace(route, navigate);
  const {
    refreshWorks,
    settingsOpen,
    setSettingsOpen,
    setConfiguration,
    libraryRevision,
    openWork,
    setCreateOpen,
    inputs,
    snapshot,
    configuration,
    error,
    setError,
    notice,
    setNotice,
    busy,
    work,
    workId,
    definition,
    baseId,
    selected,
    selectedNode,
    setSelectedNode,
    selectedMaterials,
    selectedNodeSamples,
    selectedDefinitionId,
    selectedRun,
    setSelectedRun,
    selectedResults,
    setSelectedResults,
    currentRun,
    comparison,
    changes,
    dirty,
    tab,
    setTab,
    panel,
    setPanel,
    addKind,
    setAddKind,
    runDefinition,
    setRunDefinition,
    assistantDraft,
    setAssistantDraft,
    setSamplePort,
    setTrialOpen,
    setContinueOpen,
    setContinueNode,
    setCodeOpen,
    setInvokeOpen,
    action,
    perform,
    receive,
    editDefinition,
    saveDefinition,
    discardLocalChanges,
    generate,
    runFull,
    prepareResultInputs,
    beginFrom,
    addNode,
  } = controller;
  const routeRun =
    route.kind === 'method' && route.runId && work?.id === route.id
      ? work.runs.find((run) => run.id === route.runId)
      : undefined;
  const urlRunFocus = useMemo<RunFocus | undefined>(
    () =>
      route.kind === 'method' && routeRun
        ? {
            workId: route.id,
            runId: routeRun.id,
            definitionId: routeRun.definitionId,
          }
        : undefined,
    [
      route.kind === 'method' ? route.id : undefined,
      routeRun?.id,
      routeRun?.definitionId,
    ],
  );
  useEffect(() => {
    if (pendingAuthor && work?.id === pendingAuthor.workId) {
      setAssistantDraft(pendingAuthor.text);
      setAuthorPrefill({
        ...pendingAuthor,
        onApplied: () => setAuthorPrefill(undefined),
      });
      setPanel('assistant');
      setTab('canvas');
      setPendingAuthor(undefined);
    }
  }, [pendingAuthor, work?.id]);
  useEffect(() => {
    if (
      pendingRun &&
      (route.kind !== 'method' ||
        route.id !== pendingRun.workId ||
        route.runId !== pendingRun.runId)
    ) {
      setPendingRun(undefined);
      return;
    }
    if (pendingRun && work?.id === pendingRun.workId && snapshot) {
      setSelectedRun(pendingRun.runId);
      setRequestedFocus(pendingRun);
      setTab('results');
      setPendingRun(undefined);
    }
  }, [pendingRun, work?.id, snapshot, route]);
  const original = originItem?.id === originId ? originItem : undefined;
  const originTab = route.kind === 'method' ? route.fromTab : undefined;
  const taskContext = originId ? (
    <div className="workspace-task-context">
      <span>原任务</span>
      <ObjectLink
        href={routeHref({ kind: 'item', id: originId, tab: originTab })}
        onNavigate={() =>
          navigate({ kind: 'item', id: originId, tab: originTab })
        }
        title={originError || original?.title || originId}
        aria-label={`继续工作项 ${original?.title || originId}`}
      >
        {originError ? '原工作项不可用' : original?.title || '读取工作项…'}
      </ObjectLink>
    </div>
  ) : undefined;
  const selectModel = async (selection: ModelSelection | null) => {
    if (!workId) return;
    const next = await api<Snapshot>(`/api/works/${workId}/model-selection`, {
      selection,
    });
    receive(next);
  };
  return (
    <div className="app-shell">
      <Sidebar controller={controller} route={route} navigate={navigate} />
      <main className="workspace">
        <div className="item-workspace-host" hidden={!itemsOpen}>
          <WorkItems
            mode={route.kind === 'items' ? 'list' : 'home'}
            itemId={route.kind === 'item' ? route.id : undefined}
            itemTab={route.kind === 'item' ? route.tab : undefined}
            onOpenItem={(id, tab) => navigate({ kind: 'item', id, tab })}
            onItemTab={(tab) =>
              route.kind === 'item' && navigate({ ...route, tab })
            }
            onAllItems={() => navigate({ kind: 'items' })}
            active={itemsOpen}
            onMethod={(id, authorText) => {
              navigate({
                kind: 'method',
                id,
                tab: 'canvas',
                fromItem: route.kind === 'item' ? route.id : undefined,
                fromTab: route.kind === 'item' ? route.tab : undefined,
              });
              openWork(id, false);
              if (authorText)
                setPendingAuthor({ workId: id, text: authorText });
            }}
            onRun={(ref) => {
              navigate({
                kind: 'method',
                id: ref.workId,
                tab: 'results',
                runId: ref.runId,
                fromItem: route.kind === 'item' ? route.id : undefined,
                fromTab: route.kind === 'item' ? route.tab : undefined,
              });
              openWork(ref.workId, false);
              setPendingRun(ref);
            }}
          />
        </div>
        <WorkspaceTabPanel
          active={route.kind === 'methods'}
          className="workbench-library-host"
        >
          {() => (
            <WorkLibrary
              embedded
              onOpen={openWork}
              onCreate={() => setCreateOpen(true)}
              refreshKey={libraryRevision}
              onChanged={refreshWorks}
            />
          )}
        </WorkspaceTabPanel>
        <WorkspaceTabPanel active={route.kind === 'method'}>
          {() =>
            !work ||
            !snapshot ||
            (route.kind === 'method' && work.id !== route.id) ? (
              <Empty title={error ? '无法打开流水线' : '正在载入流水线'}>
                {error && <p role="alert">{error}</p>}
                {taskContext}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate({ kind: 'methods' })}
                >
                  流水线列表
                </Button>
              </Empty>
            ) : (
              <Tabs
                value={tab}
                onValueChange={(next) => setTab(next as typeof tab)}
                className="workspace-view-tabs gap-0"
              >
                <WorkspaceHeader
                  work={work}
                  editingDefinitionId={baseId.current || work.draftId}
                  taskContext={taskContext}
                  dirty={dirty}
                  busy={busy}
                  runDefinition={runDefinition}
                  setRunDefinition={setRunDefinition}
                  selectedDefinitionId={selectedDefinitionId}
                  selectedMaterials={selectedMaterials}
                  discardLocalChanges={discardLocalChanges}
                  saveDefinition={saveDefinition}
                  runFull={runFull}
                  openInvoke={() => setInvokeOpen(true)}
                />
                <WorkspaceTabs
                  work={work}
                  tab={tab}
                  panel={panel}
                  setPanel={setPanel}
                />
                <WorkspaceNotices
                  error={error}
                  setError={setError}
                  notice={notice}
                  setNotice={setNotice}
                  configuration={configuration}
                  dirty={dirty}
                  draftId={work.draftId}
                  baseId={baseId}
                  discardLocalChanges={discardLocalChanges}
                />
                <WorkspaceContent
                  panel={
                    panel && (
                      <WorkspaceTabPanel
                        active={tab === 'canvas'}
                        className="workspace-context-host"
                      >
                        {() => (
                          <ContextPanel
                            businessTitle={work.title}
                            composerPrefill={
                              authorPrefill?.workId === work.id
                                ? authorPrefill
                                : undefined
                            }
                            panel={panel}
                            setPanel={setPanel}
                            definition={definition}
                            issues={snapshot.issues}
                            selected={selected}
                            selectedNode={selectedNode}
                            setSelectedNode={setSelectedNode}
                            editDefinition={editDefinition}
                            workId={workId}
                            draftId={work.draftId}
                            dirty={dirty}
                            messages={work.messages}
                            assistantDraft={assistantDraft}
                            setAssistantDraft={setAssistantDraft}
                            selectedNodeSamples={selectedNodeSamples}
                            definitions={snapshot.definitions}
                            setTab={setTab}
                            setTrialOpen={setTrialOpen}
                            setSamplePort={setSamplePort}
                            action={action}
                            perform={perform}
                            configuration={configuration}
                            workSelection={
                              work.modelSelections?.assistant ?? null
                            }
                            onModelSelection={selectModel}
                            onOpenSettings={() => setSettingsOpen(true)}
                          />
                        )}
                      </WorkspaceTabPanel>
                    )
                  }
                >
                  <WorkspaceTabPanel
                    value="canvas"
                    active={tab === 'canvas'}
                    key={`${work.id}-canvas`}
                  >
                    {() => (
                      <CanvasPane
                        work={work}
                        definition={definition}
                        issues={snapshot.issues}
                        currentRun={currentRun}
                        selectedNode={selectedNode}
                        setSelectedNode={setSelectedNode}
                        setPanel={setPanel}
                        setSamplePort={setSamplePort}
                        addKind={addKind}
                        setAddKind={setAddKind}
                        addNode={addNode}
                        setCodeOpen={setCodeOpen}
                        editDefinition={editDefinition}
                        action={action}
                        setError={setError}
                        generate={generate}
                        busy={busy}
                      />
                    )}
                  </WorkspaceTabPanel>
                  <WorkspaceTabPanel
                    value="results"
                    active={tab === 'results'}
                    key={`${work.id}-results`}
                  >
                    {() => (
                      <Results
                        active={tab === 'results' && !itemsOpen}
                        view={
                          route.kind === 'method' ? route.resultView : undefined
                        }
                        onViewChange={(view, runId) => {
                          if (route.kind === 'method')
                            navigate({
                              ...route,
                              tab: 'results',
                              resultView: view,
                              runId,
                            });
                        }}
                        requestedRunId={
                          route.kind === 'method' ? route.runId : undefined
                        }
                        onOpenItem={(id) => navigate({ kind: 'item', id })}
                        requestedFocus={
                          urlRunFocus &&
                          requestedFocus?.workId === work.id &&
                          requestedFocus.runId === urlRunFocus.runId
                            ? requestedFocus
                            : urlRunFocus
                        }
                        work={work}
                        definitions={snapshot.definitions}
                        selectedRun={selectedRun}
                        onRunSelect={setSelectedRun}
                        selectedResults={selectedResults}
                        onSelectResults={setSelectedResults}
                        onAction={perform}
                        onCandidate={beginFrom}
                        selectedDefinitionId={selectedDefinitionId}
                        configuration={configuration}
                        onOpenSettings={() => setSettingsOpen(true)}
                        onInvoke={() => setInvokeOpen(true)}
                        onContinue={() => {
                          setContinueOpen(true);
                          setContinueNode(
                            definition.nodes.find(
                              (n) => n.operation === 'aggregate',
                            )?.id ||
                              definition.nodes[0]?.id ||
                              '',
                          );
                          void prepareResultInputs();
                        }}
                      />
                    )}
                  </WorkspaceTabPanel>
                  <WorkspaceTabPanel
                    value="compare"
                    active={tab === 'compare'}
                    key={`${work.id}-compare`}
                  >
                    {() => (
                      <Comparison
                        work={work}
                        definitions={snapshot.definitions}
                        comparison={comparison}
                        inputs={inputs}
                        hasUnsavedChanges={dirty}
                        onAction={perform}
                      />
                    )}
                  </WorkspaceTabPanel>
                </WorkspaceContent>
                {work.draftId && work.draftId !== work.adoptedId && (
                  <CandidateBar
                    draftId={work.draftId}
                    changes={changes}
                    busy={busy}
                    dirty={dirty}
                    perform={perform}
                  />
                )}
              </Tabs>
            )
          }
        </WorkspaceTabPanel>
      </main>
      <WorkspaceDialogs
        controller={controller}
        active={route.kind === 'method' && route.id === workId}
      />
      <ModelSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        configuration={configuration}
        onSaved={setConfiguration}
      />
    </div>
  );
}
