import {
  Plus,
  Workflow,
  Play,
  Sparkles,
  PanelRightClose,
  PanelRightOpen,
  GitCompareArrows,
  Files,
  Check,
  Settings2,
  MessageSquare,
  History,
  ArrowRight,
  Save,
  Code,
} from 'lucide-react';
import type { FlowNode } from '../shared/records';
import { active, inputPorts, short, workTitle } from './model';
import { Badge, Button, Empty } from './components/ui';
import { WorkflowCanvas } from './WorkflowCanvas';
import { NodeInspector } from './NodeInspector';
import { Assistant } from './Assistant';
import { Results } from './Results';
import { Comparison } from './Comparison';

import { useWorkspace } from './useWorkspace';
import { WorkspaceDialogs } from './WorkspaceDialogs';
import { Sidebar } from './Sidebar';
import { ModelSettingsDialog } from './ModelSettingsDialog';
import WorkLibrary from './WorkLibrary';
export default function Workspace() {
  const controller = useWorkspace();
  const {
    refreshWorks,
    settingsOpen,
    setSettingsOpen,
    setConfiguration,
    libraryOpen,
    setLibraryOpen,
    libraryRevision,
    openWork,
    assistantDraft,
    setAssistantDraft,
    inputs,
    snapshot,
    configuration,
    error,
    setError,
    busy,
    setCreateOpen,
    goal,
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
    setSamplePort,
    runDefinition,
    setRunDefinition,
    selectedRun,
    setSelectedRun,
    selectedResults,
    setSelectedResults,
    setTrialOpen,
    setContinueOpen,
    setContinueNode,
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
    editDefinition,
    saveDefinition,
    discardLocalChanges,
    generate,
    runFull,
    prepareResultInputs,
    beginFrom,
    addNode,
  } = controller;
  return (
    <div className="app-shell">
      <Sidebar controller={controller} />
      <main className="workspace">
        {libraryOpen ? (
          <WorkLibrary
            onOpen={openWork}
            onCreate={() => setCreateOpen(true)}
            refreshKey={libraryRevision}
            onChanged={refreshWorks}
          />
        ) : !work || !snapshot ? (
          <div className="welcome">
            <div className="welcome-symbol">
              <Workflow size={34} />
            </div>
            <span className="eyebrow">你的目标，你的做法</span>
            <h1>
              让复杂工作
              <br />
              一步步变清楚。
            </h1>
            <p>带上材料，形成流程。检查结果，试验更好的方法。</p>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={17} />
              创建第一项工作
            </Button>
            {error && <p className="inline-error">{error}</p>}
          </div>
        ) : (
          <>
            <header className="workspace-header">
              <div className="work-title">
                <span className="eyebrow">工作空间</span>
                <h1 title={work.goal}>{workTitle(work)}</h1>
              </div>
              <div className="header-actions">
                {dirty ? (
                  <>
                    <Button
                      variant="ghost"
                      onClick={discardLocalChanges}
                      disabled={busy}
                    >
                      放弃修改
                    </Button>
                    <Button
                      onClick={() => void saveDefinition()}
                      disabled={busy}
                    >
                      <Save size={15} />
                      保存修改
                    </Button>
                  </>
                ) : (
                  <span className="saved">
                    <Check size={14} />
                    已保存
                  </span>
                )}
                <select
                  aria-label="运行使用的做法"
                  value={runDefinition}
                  onChange={(e) =>
                    setRunDefinition(e.target.value as 'adopted' | 'draft')
                  }
                >
                  <option value="adopted">
                    {work.adoptedId ? '采用的做法' : '当前草稿'}
                  </option>
                  {work.draftId && <option value="draft">候选草稿</option>}
                </select>
                <Button
                  variant="primary"
                  disabled={
                    !selectedDefinitionId ||
                    work.runs.some((r) => active(r.status)) ||
                    work.comparisons.some((c) => active(c.status)) ||
                    busy ||
                    dirty ||
                    !selectedMaterials.length
                  }
                  onClick={() => void runFull()}
                >
                  <Play size={15} />
                  运行流程
                </Button>
              </div>
            </header>
            <div className="workspace-bar">
              <div className="tabs" role="tablist" aria-label="工作内容">
                <button
                  role="tab"
                  aria-selected={tab === 'canvas'}
                  onClick={() => setTab('canvas')}
                >
                  <Workflow size={15} />
                  流程
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'results'}
                  onClick={() => setTab('results')}
                >
                  <History size={15} />
                  运行结果{' '}
                  {work.runs.length > 0 && <span>{work.runs.length}</span>}
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'compare'}
                  onClick={() => setTab('compare')}
                >
                  <GitCompareArrows size={15} />
                  比较
                </button>
              </div>
              <div className="bar-actions">
                <Badge
                  status={
                    work.draftId && work.draftId !== work.adoptedId
                      ? 'candidate'
                      : ''
                  }
                >
                  {work.draftId && work.draftId !== work.adoptedId
                    ? '候选草稿'
                    : '采用的做法'}{' '}
                  · {short(work.draftId || work.adoptedId)}
                </Badge>
                <Button
                  variant="ghost"
                  aria-label={panel ? '收起侧栏' : '打开侧栏'}
                  onClick={() => setPanel(panel ? null : 'inspector')}
                >
                  {panel ? (
                    <PanelRightClose size={17} />
                  ) : (
                    <PanelRightOpen size={17} />
                  )}
                </Button>
              </div>
            </div>
            {error && (
              <div className="error-banner" role="alert">
                {error}
                <button onClick={() => setError('')}>关闭</button>
              </div>
            )}
            {configuration && !configuration.ready && (
              <div className="notice">
                {configuration.error ||
                  '模型未配置。可编辑已有流程，AI 生成与处理需要先配置模型。'}
              </div>
            )}
            {dirty && work.draftId !== baseId.current && (
              <div className="notice">
                保存版本已被其他编辑更新。你的未提交内容已保留；请先检查新版本。
                <Button onClick={discardLocalChanges}>
                  放弃本地修改并载入新版本
                </Button>
              </div>
            )}
            <div className={`workspace-content ${panel ? 'with-panel' : ''}`}>
              <section className="main-content">
                {tab === 'canvas' ? (
                  <>
                    <div className="canvas-toolbar">
                      <div className="inline-group">
                        <select
                          aria-label="新步骤类型"
                          value={addKind}
                          onChange={(e) =>
                            setAddKind(e.target.value as FlowNode['kind'])
                          }
                        >
                          <option value="function">普通处理</option>
                          <option value="agent">Agent</option>
                          <option value="branch">条件分流</option>
                        </select>
                        <Button onClick={addNode}>
                          <Plus size={15} />
                          添加步骤
                        </Button>
                      </div>
                      <div className="inline-group">
                        <Button
                          variant="ghost"
                          onClick={() => setCodeOpen(true)}
                        >
                          <Code size={15} />
                          查看 JS
                        </Button>
                        <Button
                          onClick={() => {
                            setSelectedNode(undefined);
                            setPanel('assistant');
                          }}
                        >
                          <Sparkles size={15} />
                          修改流程
                        </Button>
                      </div>
                    </div>
                    {definition.nodes.length ? (
                      <WorkflowCanvas
                        key={work.id}
                        definition={definition}
                        view={work.view}
                        selected={selectedNode}
                        onSelect={(id) => {
                          setSelectedNode(id);
                          setPanel('inspector');
                          setSamplePort(
                            inputPorts(
                              definition.nodes.find((n) => n.id === id)!,
                            )[0],
                          );
                        }}
                        onChange={editDefinition}
                        onLayout={(view) => {
                          void action('saveLayout', { view }).catch((e) =>
                            setError(String(e)),
                          );
                        }}
                        run={
                          currentRun?.definitionId ===
                          (work.draftId || work.adoptedId)
                            ? currentRun
                            : undefined
                        }
                      />
                    ) : (
                      <Empty title="把目标变成可调整的流程">
                        <div className="empty-flow">
                          <span>
                            <Files size={21} />
                            材料
                          </span>
                          <ArrowRight size={18} />
                          <span>
                            <Sparkles size={21} />
                            处理步骤
                          </span>
                          <ArrowRight size={18} />
                          <span>
                            <Check size={21} />
                            产物
                          </span>
                        </div>
                        <Button
                          variant="primary"
                          onClick={() => void generate()}
                          disabled={
                            busy || work.messages.some((m) => active(m.status))
                          }
                        >
                          <Sparkles size={16} />
                          生成初始流程
                        </Button>
                        <p>{work.materials.length} 条材料已准备好</p>
                      </Empty>
                    )}
                    {snapshot.issues.length > 0 && (
                      <div className="issues-strip">
                        <strong>{snapshot.issues.length} 项需要修正</strong>
                        {snapshot.issues.map((issue, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setSelectedNode(issue.nodeId);
                              setPanel('inspector');
                            }}
                          >
                            {issue.nodeId
                              ? `${definition.nodes.find((n) => n.id === issue.nodeId)?.label || '节点'}：`
                              : ''}
                            {issue.message}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
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
                <aside className="context-panel">
                  <div className="panel-tabs">
                    <button
                      className={panel === 'inspector' ? 'selected' : ''}
                      onClick={() => setPanel('inspector')}
                    >
                      <Settings2 size={15} />
                      步骤配置
                    </button>
                    <button
                      className={panel === 'assistant' ? 'selected' : ''}
                      onClick={() => setPanel('assistant')}
                    >
                      <MessageSquare size={15} />
                      Assistant
                    </button>
                  </div>
                  {panel === 'inspector' ? (
                    <>
                      <NodeInspector
                        key={selectedNode}
                        definition={definition}
                        nodeId={selectedNode}
                        issues={snapshot.issues}
                        onChange={editDefinition}
                        onChat={() => setPanel('assistant')}
                      />
                      {selected && (
                        <div className="panel-bottom">
                          <span className="muted">
                            {selected.label} · 候选 {short(work.draftId)}
                          </span>
                          <Button
                            variant="primary"
                            disabled={dirty || !work.draftId}
                            onClick={() => {
                              setTrialOpen(true);
                              setSamplePort(inputPorts(selected)[0]);
                            }}
                          >
                            选择输入并试运行
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <Assistant
                      draftText={assistantDraft}
                      onDraftChange={setAssistantDraft}
                      messages={work.messages}
                      nodeLabels={Object.fromEntries(
                        definition.nodes.map((n) => [n.id, n.label]),
                      )}
                      nodeLabel={selected?.label}
                      nodeId={selectedNode}
                      draftId={work.draftId}
                      sampleIds={selectedNodeSamples}
                      definitions={snapshot.definitions}
                      onShowCanvas={(id) => {
                        setTab('canvas');
                        if (id && definition.nodes.some((n) => n.id === id))
                          setSelectedNode(id);
                      }}
                      disabled={dirty}
                      onSend={(request) => action('edit', { ...request })}
                      onStop={(requestId) => {
                        void perform('stopEdit', { requestId });
                      }}
                    />
                  )}
                </aside>
              )}
            </div>
            {work.draftId && work.draftId !== work.adoptedId && (
              <footer className="candidate-bar">
                <div>
                  <span className="candidate-dot" />
                  <strong>候选做法</strong>
                  <span>{changes.join(' · ') || '与起点相同'}</span>
                </div>
                <div>
                  <Button
                    variant="ghost"
                    disabled={busy || dirty}
                    onClick={() => void perform('discardDraft')}
                  >
                    放弃候选
                  </Button>
                  <Button
                    disabled={busy || dirty}
                    onClick={() =>
                      void perform('adopt', { definitionId: work.draftId })
                    }
                  >
                    采用做法
                    <Check size={15} />
                  </Button>
                </div>
              </footer>
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
