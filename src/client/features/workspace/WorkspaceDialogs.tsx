import type { WorkspaceController } from '../../app/controller';
import { CreateWorkDialog } from './CreateWorkDialog';
import { AddMaterialsDialog } from './AddMaterialsDialog';
import { SelectStartDialog } from './SelectStartDialog';
import { TrialDialog } from './TrialDialog';
import { ResumeDialog } from './ResumeDialog';
import { DefinitionJsDialog } from './DefinitionJsDialog';
import { InvokeDialog } from './InvokeDialog';

/** 对话框组装层：把 controller 的值显式交给各对话框，各自只依赖自己用到的字段。 */
export function WorkspaceDialogs({
  controller,
}: {
  controller: WorkspaceController;
}) {
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
      <CreateWorkDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        goal={goal}
        setGoal={setGoal}
        materialText={materialText}
        setMaterialText={setMaterialText}
        error={error}
        busy={busy}
        create={create}
      />
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
        invokeWork={invokeWork}
      />
    </>
  );
}
