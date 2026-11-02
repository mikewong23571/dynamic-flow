import { useState } from 'react';
import { ArrowRight, Info } from 'lucide-react';
import type { Definition, FlowNode } from '../../../../shared/records';
import type { MethodCapability } from '../../../../shared/workitem-composition';
import { Modal } from '../../../components/ui';
import { Button } from '../../../components/ui/button';
import { nodePrimitive } from '../../../core/definition';

export function CompositionPlan({
  definition,
  goal,
  outputTitles,
  active,
}: {
  definition: Definition;
  goal: string;
  outputTitles: Record<string, string>;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const problem = definition.problem;
  return (
    <>
      <div className="composition-plan" aria-label="业务过程规划">
        <div className="composition-plan-heading">
          <span className="meta-text">本轮处理目标</span>
          {problem && (
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
              <Info size={14} />
              依据与边界
            </Button>
          )}
        </div>
        <p title={problem?.framing || goal}>{problem?.framing || goal}</p>
        {!!Object.keys(definition.outputs).length && (
          <div className="composition-plan-outputs" aria-label="计划交付">
            <span className="meta-text">交付</span>
            {Object.keys(definition.outputs).map((output) => (
              <span key={output}>
                <ArrowRight size={13} />
                {outputTitles[output] || output}
              </span>
            ))}
          </div>
        )}
      </div>
      <Modal
        open={active && open}
        onOpenChange={setOpen}
        title="规划依据与边界"
      >
        <dl className="composition-plan-details">
          <div>
            <dt>本轮处理目标</dt>
            <dd>{problem?.framing || goal}</dd>
          </div>
          {(
            [
              ['已知情况', problem?.known],
              ['尚待确认', problem?.unknown],
              ['处理边界', problem?.constraints],
              ['依据', problem?.evidence],
            ] as const
          )
            .filter(([, value]) => value?.trim())
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
      </Modal>
    </>
  );
}

export function CompositionStep({
  node,
  definition,
  outputTitles,
  onClose,
  onImprove,
  method,
  onMethod,
}: {
  node: FlowNode;
  definition: Definition;
  outputTitles: Record<string, string>;
  onClose: () => void;
  onImprove: () => void;
  method?: MethodCapability;
  onMethod: () => void;
}) {
  const predecessors = definition.edges
    .filter((edge) => edge.to[0] === node.id)
    .map((edge) =>
      edge.from[0] === '$input'
        ? '工作项输入'
        : definition.nodes.find((candidate) => candidate.id === edge.from[0])
            ?.label || edge.from[0],
    );
  const successors = definition.edges
    .filter((edge) => edge.from[0] === node.id)
    .map(
      (edge) =>
        definition.nodes.find((candidate) => candidate.id === edge.to[0])
          ?.label || edge.to[0],
    );
  const outputs = Object.entries(definition.outputs)
    .filter(([, ref]) => ref[0] === node.id)
    .map(([output]) => outputTitles[output] || output);
  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title={node.label}>
      <dl className="composition-plan-details">
        <div>
          <dt>处理原语</dt>
          <dd>{nodePrimitive(node, true)}</dd>
        </div>
        <div>
          <dt>负责处理</dt>
          <dd>{node.contract?.responsibility || '此步骤尚未记录业务职责。'}</dd>
        </div>
        {node.contract?.done && (
          <div>
            <dt>完成时交出</dt>
            <dd>{node.contract.done}</dd>
          </div>
        )}
        <div className="composition-step-handoff">
          <div>
            <dt>接收</dt>
            <dd>{[...new Set(predecessors)].join('、') || '无前置输入'}</dd>
          </div>
          <ArrowRight size={16} />
          <div>
            <dt>交给</dt>
            <dd>
              {[...new Set([...successors, ...outputs])].join('、') ||
                '当前步骤输出'}
            </dd>
          </div>
        </div>
        {node.contract?.rationale && (
          <div>
            <dt>这样拆分的原因</dt>
            <dd>{node.contract.rationale}</dd>
          </div>
        )}
        {node.kind === 'call' && (
          <div>
            <dt>引用的流水线</dt>
            <dd>
              <Button variant="outline" onClick={onMethod}>
                {method?.title || '查看固定流水线'}
              </Button>
              <span className="meta-text">
                {' '}
                · 固定版 {node.call?.definitionId.slice(0, 8)}
              </span>
            </dd>
          </div>
        )}
      </dl>
      {!node.contract && (
        <div className="composition-step-actions">
          <Button variant="outline" onClick={onImprove}>
            请 Assistant 完善这一步
          </Button>
        </div>
      )}
    </Modal>
  );
}
