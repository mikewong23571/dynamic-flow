import { useEffect, useState } from 'react';
import type {
  ItemRunRef,
  ModelSelection,
  Snapshot,
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
import { CandidateBar } from './CandidateBar';
import { CanvasPane } from './CanvasPane';
import { ContextPanel } from './ContextPanel';
import { Welcome } from './Welcome';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceNotices } from './WorkspaceNotices';
import { WorkspaceTabs } from './WorkspaceTabs';

/** 页面组装：侧栏、工作区（头部/标签/横幅/主内容/右面板/候选底栏）与全局对话框。 */
export default function Workspace() {
  const [itemsOpen, setItemsOpen] = useState(false);
  const [pendingRun, setPendingRun] = useState<ItemRunRef>();
  const controller = useWorkspace();
  const {
    refreshWorks,
    settingsOpen,
    setSettingsOpen,
    setConfiguration,
    libraryOpen,
    libraryRevision,
    openWork,
    setCreateOpen,
    inputs,
    snapshot,
    configuration,
    error,
    setError,
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
  useEffect(() => {
    if (pendingRun && work?.id === pendingRun.workId && snapshot) {
      setSelectedRun(pendingRun.runId);
      setTab('results');
      setPanel(null);
      setPendingRun(undefined);
    }
  }, [pendingRun, work?.id, snapshot]);
  const selectModel = async (selection: ModelSelection | null) => {
    if (!workId) return;
    const next = await api<Snapshot>(`/api/works/${workId}/model-selection`, {
      selection,
    });
    receive(next);
  };
  return (
    <div className="app-shell">
      <Sidebar
        controller={controller}
        itemsOpen={itemsOpen}
        onItems={() => setItemsOpen(true)}
        onMethods={() => setItemsOpen(false)}
      />
      <main className="workspace">
        {itemsOpen ? (
          <WorkItems
            onMethod={(id) => {
              setItemsOpen(false);
              openWork(id);
            }}
            onRun={(ref) => {
              setItemsOpen(false);
              openWork(ref.workId);
              setPendingRun(ref);
            }}
          />
        ) : libraryOpen ? (
          <WorkLibrary
            onOpen={openWork}
            onCreate={() => setCreateOpen(true)}
            refreshKey={libraryRevision}
            onChanged={refreshWorks}
          />
        ) : !work || !snapshot ? (
          <Welcome error={error} onCreate={() => setCreateOpen(true)} />
        ) : (
          <>
            <WorkspaceHeader
              work={work}
              dirty={dirty}
              busy={busy}
              runDefinition={runDefinition}
              setRunDefinition={setRunDefinition}
              selectedDefinitionId={selectedDefinitionId}
              selectedMaterials={selectedMaterials}
              discardLocalChanges={discardLocalChanges}
              saveDefinition={saveDefinition}
              runFull={runFull}
            />
            <WorkspaceTabs
              work={work}
              tab={tab}
              setTab={setTab}
              panel={panel}
              setPanel={setPanel}
            />
            <WorkspaceNotices
              error={error}
              setError={setError}
              configuration={configuration}
              dirty={dirty}
              draftId={work.draftId}
              baseId={baseId}
              discardLocalChanges={discardLocalChanges}
            />
            <div className="workspace-content">
              <section className="main-content">
                {tab === 'canvas' ? (
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
                ) : tab === 'results' ? (
                  <Results
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
                    onContinue={() => {
                      setContinueOpen(true);
                      setContinueNode(
                        definition.nodes.find((n) => n.mode === 'all')?.id ||
                          definition.nodes[0]?.id ||
                          '',
                      );
                      void prepareResultInputs();
                    }}
                  />
                ) : (
                  <Comparison
                    work={work}
                    definitions={snapshot.definitions}
                    comparison={comparison}
                    inputs={inputs}
                    hasUnsavedChanges={dirty}
                    onAction={perform}
                  />
                )}
              </section>
              {panel && (
                <ContextPanel
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
                  workSelection={work.modelSelections?.assistant ?? null}
                  onModelSelection={selectModel}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              )}
            </div>
            {work.draftId && work.draftId !== work.adoptedId && (
              <CandidateBar
                draftId={work.draftId}
                changes={changes}
                busy={busy}
                dirty={dirty}
                perform={perform}
              />
            )}
          </>
        )}
      </main>
      <WorkspaceDialogs controller={controller} />
      <ModelSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        configuration={configuration}
        onSaved={setConfiguration}
      />
    </div>
  );
}
