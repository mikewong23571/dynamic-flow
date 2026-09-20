import { Play, GitCompareArrows } from 'lucide-react';
import type { FlowNode, Inputs, Work } from '../../../shared/records';
import { inputPorts } from '../../core/inputs';
import { short, portLabel } from '../../core/format';
import { Button, Modal } from '../../components/ui';

import { InputContent } from '../results/Results';

/** 局部试验：选择固定输入与端口，只运行或比较当前步骤。 */
export function TrialDialog({
  open,
  onOpenChange,
  selected,
  work,
  inputMode,
  setInputMode,
  samplePort,
  setSamplePort,
  selectedNode,
  selectedNodeSamples,
  setSampleSelection,
  selectedResults,
  prepareResultInputs,
  previewInputs,
  error,
  inputs,
  busy,
  trial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected?: FlowNode;
  work?: Work;
  inputMode: 'materials' | 'results';
  setInputMode: (mode: 'materials' | 'results') => void;
  samplePort: string;
  setSamplePort: (port: string) => void;
  selectedNode?: string;
  selectedNodeSamples: string[];
  setSampleSelection: (
    update: (prev: Record<string, string[]>) => Record<string, string[]>,
  ) => void;
  selectedResults: string[];
  prepareResultInputs: () => void;
  previewInputs: Inputs | null;
  error: string;
  inputs: Inputs;
  busy: boolean;
  trial: (compare?: boolean) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
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
  );
}
