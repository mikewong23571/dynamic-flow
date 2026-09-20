import { useEffect, useState } from 'react';
import type { FlowNode } from '../../shared/records';

/** 面板、标签页与各对话框开关；创建工作与添加材料的表单输入。 */
export function usePanels(hasWork: boolean) {
  const [panel, setPanel] = useState<'inspector' | 'assistant' | null>(
    'assistant',
  );
  const [tab, setTab] = useState<'canvas' | 'results' | 'compare'>('canvas');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(!hasWork);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [goal, setGoal] = useState(
    () => localStorage.getItem('dynamic-flow.goal') || '',
  );
  const [materialText, setMaterialText] = useState(
    () => localStorage.getItem('dynamic-flow.materials') || '',
  );
  const [addOpen, setAddOpen] = useState(false);
  const [newMaterials, setNewMaterials] = useState('');
  const [trialOpen, setTrialOpen] = useState(false);
  const [continueOpen, setContinueOpen] = useState(false);
  const [continueNode, setContinueNode] = useState('');
  const [candidateSource, setCandidateSource] = useState<string>();
  const [sourceChoice, setSourceChoice] = useState('');
  const [replaceDraft, setReplaceDraft] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
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
    addKind,
    setAddKind,
  };
}
