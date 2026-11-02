import { useEffect, useState } from 'react';
import type { FlowNode } from '../../shared/records';

/** 面板、标签页与各对话框开关；创建工作与添加材料的表单输入。 */
export function usePanels(workId: string) {
  const [panel, setPanel] = useState<'inspector' | 'assistant' | null>(
    'assistant',
  );
  const [tab, setTab] = useState<'canvas' | 'results' | 'compare'>('canvas');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(!workId);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [goal, setGoal] = useState(
    () => localStorage.getItem('dynamic-flow.goal') || '',
  );
  const [materialText, setMaterialText] = useState(
    () => localStorage.getItem('dynamic-flow.materials') || '',
  );
  // Business dialogs belong to one method, including their open state.
  type MethodDialogs = {
    addOpen: boolean;
    newMaterials: string;
    trialOpen: boolean;
    continueOpen: boolean;
    continueNode: string;
    candidateSource: string | undefined;
    sourceChoice: string;
    replaceDraft: boolean;
    codeOpen: boolean;
    invokeOpen: boolean;
  };
  const [dialogs, setDialogs] = useState<Record<string, MethodDialogs>>({});
  const currentDialogs = dialogs[workId] || {
    addOpen: false,
    newMaterials: '',
    trialOpen: false,
    continueOpen: false,
    continueNode: '',
    candidateSource: undefined,
    sourceChoice: '',
    replaceDraft: false,
    codeOpen: false,
    invokeOpen: false,
  };
  function setDialog<K extends keyof MethodDialogs>(
    key: K,
    value: MethodDialogs[K],
  ) {
    setDialogs((previous) => ({
      ...previous,
      [workId]: { ...(previous[workId] || currentDialogs), [key]: value },
    }));
  }
  const {
    addOpen,
    newMaterials,
    trialOpen,
    continueOpen,
    continueNode,
    candidateSource,
    sourceChoice,
    replaceDraft,
    codeOpen,
    invokeOpen,
  } = currentDialogs;
  const setAddOpen = (value: boolean) => setDialog('addOpen', value);
  const setNewMaterials = (value: string) => setDialog('newMaterials', value);
  const setTrialOpen = (value: boolean) => setDialog('trialOpen', value);
  const setContinueOpen = (value: boolean) => setDialog('continueOpen', value);
  const setContinueNode = (value: string) => setDialog('continueNode', value);
  const setCandidateSource = (value: string | undefined) =>
    setDialog('candidateSource', value);
  const setSourceChoice = (value: string) => setDialog('sourceChoice', value);
  const setReplaceDraft = (value: boolean) => setDialog('replaceDraft', value);
  const setCodeOpen = (value: boolean) => setDialog('codeOpen', value);
  const setInvokeOpen = (value: boolean) => setDialog('invokeOpen', value);
  const [addKind, setAddKind] = useState<FlowNode['kind']>('function');
  useEffect(() => {
    localStorage.setItem('dynamic-flow.goal', goal);
  }, [goal]);
  useEffect(() => {
    localStorage.setItem('dynamic-flow.materials', materialText);
  }, [materialText]);
  return {
    panel,
    setPanel,
    tab,
    setTab,
    settingsOpen,
    setSettingsOpen,
    libraryOpen,
    setLibraryOpen,
    libraryRevision,
    bumpLibrary: () => setLibraryRevision((v) => v + 1),
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
    invokeOpen,
    setInvokeOpen,
    addKind,
    setAddKind,
  };
}
