import type { Definition, Inputs, Snapshot } from '../../../shared/records';
import { localInputs, inputPorts } from '../../core/inputs';
import { short } from '../../core/format';
import { Button, Modal } from '../../components/ui';

import { InputContent } from '../results/Results';

/** 用指定结果继续工作：确认来源与后续步骤，创建单节点运行。 */
export function ResumeDialog({
  open,
  onOpenChange,
  continueNode,
  setContinueNode,
  executionDefinition,
  selectedDefinitionId,
  previewInputs,
  error,
  busy,
  dirty,
  perform,
  setSelectedRun,
  setTab,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  continueNode: string;
  setContinueNode: (node: string) => void;
  executionDefinition: Definition;
  selectedDefinitionId?: string;
  previewInputs: Inputs | null;
  error: string;
  busy: boolean;
  dirty: boolean;
  perform: (
    name: string,
    fields?: Record<string, unknown>,
  ) => Promise<Snapshot | undefined>;
  setSelectedRun: (run: string | undefined) => void;
  setTab: (tab: 'canvas' | 'results' | 'compare') => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
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
            onOpenChange(false);
            setSelectedRun(next.work.runs[next.work.runs.length - 1]?.id);
            setTab('results');
          }
        }}
      >
        确认这些输入并继续
      </Button>
    </Modal>
  );
}
