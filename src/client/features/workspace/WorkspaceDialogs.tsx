import { short, workTitle } from '../../core/format';
import { useRef } from 'react';
import { ContentVisibility } from '../../components/ContentVisibility';
import type { WorkspaceController } from '../../app/controller';
import { CreateWorkDialog } from './CreateWorkDialog';
import { AddMaterialsDialog } from './AddMaterialsDialog';
import { SelectStartDialog } from './SelectStartDialog';
import { TrialDialog } from './TrialDialog';
import { ResumeDialog } from './ResumeDialog';
import { DefinitionJsDialog } from './DefinitionJsDialog';
import { InvokeDialog } from './InvokeDialog';

/** 对话框组装层：把 controller 的值显式交给各对话框，各自只依赖自己用到的字段。 */
function MethodDialogs({ controller }: { controller: WorkspaceController }) {
  const {
    createOpen,
    setCreateOpen,
    goal,
    setGoal,
    materialText,
    setMaterialText,
    error,
    busy,
    create,
    addOpen,
    setAddOpen,
    newMaterials,
    setNewMaterials,
    setSelectedMaterials,
    setPanel,
    setTab,
    candidateSource,
    setCandidateSource,
    sourceChoice,
    setSourceChoice,
    replaceDraft,
    setReplaceDraft,
    trialOpen,
    setTrialOpen,
    inputMode,
    setInputMode,
    sampleSource,
    setSampleSource,
    samplePort,
    setSamplePort,
    setSampleSelection,
    prepareResultInputs,
    trial,
    continueOpen,
    setContinueOpen,
    continueNode,
    setContinueNode,
    setSelectedRun,
    codeOpen,
    setCodeOpen,
    invokeOpen,
    setInvokeOpen,
    invokeWork,
    work,
    definition,
    selected,
    selectedNode,
    selectedNodeSamples,
    selectedDefinitionId,
    selectedResults,
    executionDefinition,
    previewInputs,
    inputs,
    dirty,
    perform,
  } = controller;
  return (
    <>
      <AddMaterialsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        work={work}
        newMaterials={newMaterials}
        setNewMaterials={setNewMaterials}
        busy={busy}
        perform={perform}
        setSelectedMaterials={setSelectedMaterials}
        setPanel={setPanel}
      />
      <SelectStartDialog
        candidateSource={candidateSource}
        setCandidateSource={setCandidateSource}
        sourceChoice={sourceChoice}
        setSourceChoice={setSourceChoice}
        replaceDraft={replaceDraft}
        setReplaceDraft={setReplaceDraft}
        work={work}
        dirty={dirty}
        busy={busy}
        perform={perform}
        setTab={setTab}
        setPanel={setPanel}
      />
      <TrialDialog
        open={trialOpen}
        onOpenChange={setTrialOpen}
        selected={selected}
        work={work}
        sampleSource={sampleSource}
        setSampleSource={setSampleSource}
        inputMode={inputMode}
        setInputMode={setInputMode}
        samplePort={samplePort}
        setSamplePort={setSamplePort}
        selectedNode={selectedNode}
        selectedNodeSamples={selectedNodeSamples}
        setSampleSelection={setSampleSelection}
        selectedResults={selectedResults}
        prepareResultInputs={prepareResultInputs}
        previewInputs={previewInputs}
        error={error}
        inputs={inputs}
        busy={busy}
        trial={trial}
      />
      <ResumeDialog
        open={continueOpen}
        onOpenChange={setContinueOpen}
        continueNode={continueNode}
        setContinueNode={setContinueNode}
        executionDefinition={executionDefinition}
        selectedDefinitionId={selectedDefinitionId}
        previewInputs={previewInputs}
        error={error}
        busy={busy}
        dirty={dirty}
        perform={perform}
        setSelectedRun={setSelectedRun}
        setTab={setTab}
      />
      <DefinitionJsDialog
        open={codeOpen}
        onOpenChange={setCodeOpen}
        definition={definition}
      />
      <InvokeDialog
        open={invokeOpen}
        onOpenChange={setInvokeOpen}
        definition={executionDefinition}
        identity={
          work
            ? `${workTitle(work)} · ${short(selectedDefinitionId)}`
            : undefined
        }
        invokeWork={invokeWork}
      />
    </>
  );
}

/** Keep method forms tied to their method while only the visible workspace presents portals. */
export function WorkspaceDialogs({
  controller,
  active,
}: {
  controller: WorkspaceController;
  active: boolean;
}) {
  const retained = useRef(new Map<string, WorkspaceController>());
  if (controller.work?.id === controller.workId)
    retained.current.set(controller.workId, controller);
  return (
    <>
      <CreateWorkDialog
        open={controller.createOpen}
        onOpenChange={controller.setCreateOpen}
        goal={controller.goal}
        setGoal={controller.setGoal}
        materialText={controller.materialText}
        setMaterialText={controller.setMaterialText}
        error={controller.error}
        busy={controller.busy}
        create={controller.create}
      />
      {[...retained.current].map(([id, saved]) => (
        <ContentVisibility key={id} active={active && id === controller.workId}>
          <MethodDialogs controller={saved} />
        </ContentVisibility>
      ))}
    </>
  );
}
