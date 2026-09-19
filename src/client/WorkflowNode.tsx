import { useEffect } from 'react';
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
  type Node,
} from '@xyflow/react';
import {
  Boxes,
  GitBranch,
  Bot,
  FileText,
  Check,
  LoaderCircle,
  AlertCircle,
  Clock3,
  Flag,
} from 'lucide-react';
import type { FlowNode } from '../shared/records';
import { inputPorts, outputPorts, statusNames, portLabel } from './model';
import { expressionSummary } from './expression-model';
import { collectionSummary } from './collection-model';
export type CanvasData = {
  label: string;
  node?: FlowNode;
  ports?: string[];
  status?: string;
  progress?: string;
  final?: boolean;
  onPortFocus?: (port?: {
    nodeId: string;
    id: string;
    direction: 'input' | 'output';
  }) => void;
};
export function WorkflowNode({
  id,
  data,
  selected,
}: NodeProps<Node<CanvasData>>) {
  const { node } = data;
  const Icon = !node
    ? FileText
    : node.kind === 'agent'
      ? Bot
      : node.kind === 'branch'
        ? GitBranch
        : node.kind === 'wait'
          ? Clock3
          : node.kind === 'milestone'
            ? Flag
            : Boxes;
  const inputs = node ? inputPorts(node) : [];
  const outputs = node ? outputPorts(node) : data.ports || [];
  const state = data.status;
  const updateNodeInternals = useUpdateNodeInternals();
  const portIdentity = JSON.stringify([inputs, outputs]);
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, portIdentity, updateNodeInternals]);
  return (
    <div
      className={`workflow-node ${selected ? 'selected' : ''} ${state || ''}`}
    >
      <div className="node-heading">
        <span className={`node-icon ${node?.kind || 'material'}`}>
          <Icon size={20} />
        </span>
        <div className="node-identity">
          <span className="node-kind">
            {!node
              ? '输入'
              : node.kind === 'agent'
                ? 'Agent'
                : node.kind === 'branch'
                  ? '条件分流'
                  : node.kind === 'wait'
                    ? '持久等待'
                    : node.kind === 'milestone'
                      ? '业务里程碑'
                      : '数据处理'}
          </span>
          <strong title={data.label}>{data.label}</strong>
        </div>
      </div>
      {node?.kind === 'branch' && (
        <p
          className="node-condition"
          title={`${node.condition?.field || '整个输入'} ${node.condition?.operator || ''} ${String(node.condition?.value ?? '')}`}
        >
          {node.condition?.field || '整个输入'} ·{' '}
          {node.condition?.operator === 'contains'
            ? '包含'
            : node.condition?.operator === 'equals'
              ? '等于'
              : '存在'}{' '}
          {String(node.condition?.value ?? '')}
        </p>
      )}
      {node?.functionName === 'expression' && (
        <p
          className="node-condition"
          title={expressionSummary(node.expression)}
        >
          {expressionSummary(node.expression)}
        </p>
      )}
      <div className="node-summary">
        <span>
          {node
            ? collectionSummary(node) ||
              (node.kind === 'wait'
                ? node.wait?.event || '等待事件'
                : node.kind === 'milestone'
                  ? node.milestone?.stage || '记录进展'
                  : node.operation === 'flatMap'
                    ? 'FlatMap · 展开'
                    : node.mode === 'each'
                      ? `Map · 并发 ${node.concurrency || 1}`
                      : '整批汇总')
            : '原始材料'}
          {data.final && <span className="node-final">最终产物</span>}
        </span>
        {node && (
          <span
            className={`node-status ${state || ''}`}
            title={statusNames[state || ''] || '待运行'}
          >
            {state === 'completed' ? (
              <Check size={12} />
            ) : state === 'running' ? (
              <LoaderCircle size={12} className="spin" />
            ) : state === 'failed' || state === 'blocked' ? (
              <AlertCircle size={12} />
            ) : null}
            {state === 'waiting'
              ? '等待事件'
              : data.progress || statusNames[state || ''] || '待运行'}
          </span>
        )}
      </div>
      <div className="node-ports">
        <span className="node-port-count">
          {inputs.length ? `${inputs.length} 输入 · ` : ''}
          {outputs.length} 输出
        </span>
        <div className="port-column">
          {inputs.map((port) => (
            <div
              key={port}
              className="node-port input"
              onMouseEnter={() =>
                data.onPortFocus?.({ nodeId: id, id: port, direction: 'input' })
              }
              onMouseLeave={() => data.onPortFocus?.()}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={port}
                aria-label={`输入 ${portLabel(port)}`}
                tabIndex={0}
                onFocus={() =>
                  data.onPortFocus?.({
                    nodeId: id,
                    id: port,
                    direction: 'input',
                  })
                }
                onBlur={() => data.onPortFocus?.()}
              />
              <span className="node-port-label" title={portLabel(port)}>
                {portLabel(port)}
              </span>
            </div>
          ))}
        </div>
        <div className="port-column">
          {outputs.map((port) => (
            <div
              key={port}
              className="node-port output"
              onMouseEnter={() =>
                data.onPortFocus?.({
                  nodeId: id,
                  id: port,
                  direction: 'output',
                })
              }
              onMouseLeave={() => data.onPortFocus?.()}
            >
              <span className="node-port-label" title={portLabel(port)}>
                {portLabel(port)}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={port}
                aria-label={`输出 ${portLabel(port)}`}
                tabIndex={0}
                onFocus={() =>
                  data.onPortFocus?.({
                    nodeId: id,
                    id: port,
                    direction: 'output',
                  })
                }
                onBlur={() => data.onPortFocus?.()}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
