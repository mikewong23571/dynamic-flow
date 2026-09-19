import { Play, GitCompareArrows, ArrowRight } from 'lucide-react';

import {
  inputPorts,
  short,
  splitMaterials,
  portLabel,
  localInputs,
} from './model';
import { Button, Modal } from './components/ui';

import { InputContent } from './Results';

import type { WorkspaceController } from './useWorkspace';
export function WorkspaceDialogs({
  controller,
}: {
  controller: WorkspaceController;
}) {
  const {
    executionDefinition,
    inputs,
    error,
    busy,
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
    selectedNode,
    setPanel,
    setTab,
    dirty,
    setSelectedMaterials,
    setSampleSelection,
    inputMode,
    setInputMode,
    samplePort,
    setSamplePort,
    setSelectedRun,
    selectedResults,
    previewInputs,
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
    work,
    definition,
    selected,
    selectedDefinitionId,
    selectedNodeSamples,
    perform,
    create,
    prepareResultInputs,
    trial,
  } = controller;
  return (
    <>
      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="开始一项工作"
        description="填写目标，再确认材料的拆分结果。"
      >
        <label className="field">
          工作目标
          <textarea
            rows={3}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="例如：整理客户反馈，区分问题、需求与称赞，给出有依据的建议。报告必须引用反馈编号。"
          />
        </label>
        <label className="field">
          材料 · 每行一条
          <textarea
            rows={6}
            value={materialText}
            onChange={(e) => setMaterialText(e.target.value)}
            placeholder="粘贴需要处理的原始材料…"
          />
        </label>
        <div className="material-preview">
          <strong>已拆分 {splitMaterials(materialText).length} 条材料</strong>
          {splitMaterials(materialText).map((text, i) => (
            <p key={i}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {text}
            </p>
          ))}
        </div>
        {error && <p className="inline-error">{error}</p>}
        <div className="modal-actions">
          <Button onClick={() => setCreateOpen(false)}>取消</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void create()}
          >
            创建工作
            <ArrowRight size={15} />
          </Button>
        </div>
      </Modal>
      <Modal
        open={addOpen}
        onOpenChange={setAddOpen}
        title="添加新材料"
        description="新材料加入本工作；历史运行与报告保留原输入。"
      >
        <label className="field">
          每行一条材料
          <textarea
            rows={7}
            value={newMaterials}
            onChange={(e) => setNewMaterials(e.target.value)}
          />
        </label>
        <p className="muted">将添加 {splitMaterials(newMaterials).length} 条</p>
        <Button
          variant="primary"
          disabled={busy || !splitMaterials(newMaterials).length}
          onClick={async () => {
            const old = new Set(work?.materials.map((m) => m.id));
            const next = await perform('addMaterials', {
              materials: splitMaterials(newMaterials),
            });
            if (next) {
              setSelectedMaterials(
                next.work.materials
                  .filter((m) => !old.has(m.id))
                  .map((m) => m.id),
              );
              setAddOpen(false);
              setNewMaterials('');
            }
          }}
        >
          添加并选中新材料
        </Button>
      </Modal>
      <Modal
        open={!!candidateSource}
        onOpenChange={(v) => !v && setCandidateSource(undefined)}
        title="选择改进的起点"
        description="历史结果属于它自己的做法版本。选择起点后创建候选，不会改写原运行。"
      >
        <label className="field">
          起点版本
          <select
            value={sourceChoice}
            onChange={(e) => setSourceChoice(e.target.value)}
          >
            {[
              ...new Set(
                [candidateSource, work?.adoptedId, work?.draftId].filter(
                  Boolean,
                ),
              ),
            ].map((id) => (
              <option key={id} value={id}>
                {id === candidateSource
                  ? '问题结果的版本'
                  : id === work?.adoptedId
                    ? '当前采用的版本'
                    : '现有候选'}{' '}
                · {short(id)}
              </option>
            ))}
          </select>
        </label>
        {work?.draftId &&
          work.draftId !== work.adoptedId &&
          work.draftId !== sourceChoice && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={replaceDraft}
                onChange={(e) => setReplaceDraft(e.target.checked)}
              />
              替换现有候选（历史定义和结果仍保留）
            </label>
          )}
        {dirty && <p className="notice">请先保存未提交的画布修改。</p>}
        <Button
          variant="primary"
          disabled={
            busy ||
            dirty ||
            (!!work?.draftId &&
              work.draftId !== work.adoptedId &&
              work.draftId !== sourceChoice &&
              !replaceDraft)
          }
          onClick={async () => {
            const next = await perform('beginCandidate', {
              sourceId: sourceChoice,
              replaceExisting: replaceDraft,
            });
            if (next) {
              setCandidateSource(undefined);
              setTab('canvas');
              setPanel('inspector');
            }
          }}
        >
          创建候选
        </Button>
      </Modal>
      <Modal
        open={trialOpen}
        onOpenChange={setTrialOpen}
        title={`试验「${selected?.label || '步骤'}」`}
        description="只处理下面明确选择的输入，不自动运行上游。"
      >
        <div className="inline-group">
          <label className="field">
            输入来源
            <select
              value={inputMode}
              onChange={(e) =>
                setInputMode(e.target.value as 'materials' | 'results')
              }
            >
              <option value="materials">原始材料</option>
              <option value="results">已选历史结果</option>
            </select>
          </label>
          <label className="field">
            目标端口
            <select
              value={samplePort}
              onChange={(e) => setSamplePort(e.target.value)}
            >
              {(selected ? inputPorts(selected) : ['input']).map((p) => (
                <option key={p} value={p}>
                  {portLabel(p)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {inputMode === 'materials' ? (
          <div className="sample-picker">
            {work?.materials.map((m) => (
              <label key={m.id} className="check-row">
                <input
                  type="checkbox"
                  checked={selectedNodeSamples.includes(m.id)}
                  onChange={() => {
                    if (selectedNode)
                      setSampleSelection((prev) => ({
                        ...prev,
                        [selectedNode]: selectedNodeSamples.includes(m.id)
                          ? selectedNodeSamples.filter((x) => x !== m.id)
                          : [...selectedNodeSamples, m.id],
                      }));
                  }}
                />
                <span>
                  <b>{m.id}</b> {m.text}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className="stack">
            <p>
              跨运行已选 {selectedResults.length}{' '}
              条成功结果。可在「运行结果」勾选。
            </p>
            <Button
              disabled={!selectedResults.length}
              onClick={() => void prepareResultInputs()}
            >
              确认所选结果作为输入
            </Button>
            {previewInputs && <InputContent inputs={previewInputs} />}
          </div>
        )}
        {error && <p className="inline-error">{error}</p>}
        {selected?.functionName === 'merge' && (
          <p className="notice">
            本次所选输入送入 {portLabel(samplePort)}；另一端口为空。
          </p>
        )}
        <p className="muted">
          固定 {Object.values(inputs).flat().length} 条输入 · 候选{' '}
          {short(work?.draftId)}
        </p>
        <div className="modal-actions">
          <Button
            disabled={
              busy ||
              !Object.values(inputs).flat().length ||
              (!work?.draftBaseId && !work?.adoptedId)
            }
            onClick={() => void trial(true)}
          >
            <GitCompareArrows size={15} />
            比较当前与候选
          </Button>
          <Button
            variant="primary"
            disabled={busy || !Object.values(inputs).flat().length}
            onClick={() => void trial()}
          >
            <Play size={15} />
            仅试运行此步骤
          </Button>
        </div>
      </Modal>
      <Modal
        open={continueOpen}
        onOpenChange={setContinueOpen}
        title="用指定结果继续工作"
        description="确认以下来源后创建新的单节点运行。保留结果与采用做法互不替代。"
      >
        <label className="field">
          后续步骤
          <select
            value={continueNode}
            onChange={(e) => setContinueNode(e.target.value)}
          >
            {executionDefinition.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">使用做法 {short(selectedDefinitionId)}</p>
        {previewInputs ? (
          <InputContent inputs={previewInputs} />
        ) : (
          <p>正在检查所选结果是否有重复材料…</p>
        )}
        {error && <p className="inline-error">{error}</p>}
        <Button
          variant="primary"
          disabled={busy || !previewInputs || !continueNode || dirty}
          onClick={async () => {
            const next = await perform('run', {
              definitionId: selectedDefinitionId,
              scope: { nodeId: continueNode },
              inputs: localInputs(
                executionDefinition.nodes.find((n) => n.id === continueNode),
                previewInputs || {},
                inputPorts(
                  executionDefinition.nodes.find((n) => n.id === continueNode)!,
                )[0],
              ),
            });
            if (next) {
              setContinueOpen(false);
              setSelectedRun(next.work.runs[next.work.runs.length - 1]?.id);
              setTab('results');
            }
          }}
        >
          确认这些输入并继续
        </Button>
      </Modal>
      <Modal
        open={codeOpen}
        onOpenChange={setCodeOpen}
        title="流程定义 · 只读 JS"
      >
        <pre className="code-view">
          export default {JSON.stringify(definition, null, 2)};
        </pre>
      </Modal>
    </>
  );
}
