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
  Clock3,
  Flag,
  ArrowUpRight,
  Workflow,
  FileOutput,
} from 'lucide-react';
import type { FlowNode } from '../../../shared/records';
import { inputPorts, outputPorts } from '../../core/inputs';
import { Badge } from '../../components/ui';
import { statusNames, portLabel } from '../../core/format';
import { expressionSummary } from '../inspector/expression-model';
import { collectionSummary } from '../inspector/collection-model';
import { Button } from '../../components/ui/button';
import { nodePrimitive } from '../../core/definition';
export type CanvasMethodReference = {
  title: string;
  onOpen: () => void;
};
export type CanvasData = {
  label: string;
  business?: boolean;
  nativeLabels?: boolean;
  outputLabels?: Record<string, string>;
  finalPorts?: string[];
  methodReference?: CanvasMethodReference;
  onInspect?: () => void;
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
  const labelPort = (port: string) =>
    data.nativeLabels ? port : portLabel(port);
  const labelOutput = (port: string) =>
    data.nativeLabels ? port : data.outputLabels?.[port] || portLabel(port);
  const pipeline = node?.kind === 'call';
  const title = pipeline
    ? data.methodReference?.title || data.label
    : data.label;
  const responsibility = data.business
    ? node?.contract?.responsibility ||
      (pipeline && node.label !== title ? node.label : undefined)
    : undefined;
  const Icon = !node
    ? FileText
    : node.kind === 'file'
      ? FileText
      : node.kind === 'agent'
        ? Bot
        : node.kind === 'branch'
          ? GitBranch
          : node.kind === 'wait'
            ? Clock3
            : node.kind === 'milestone'
              ? Flag
              : pipeline
                ? Workflow
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
      className={`workflow-node ${selected ? 'selected' : ''} ${state || ''} ${data.business ? 'workflow-node-business' : ''}`}
    >
      <div className="node-heading">
        <span className={`node-icon ${node?.kind || 'material'}`}>
          <Icon size={20} />
        </span>
        <div className="node-identity">
          <span className="node-kind">
            {node
              ? nodePrimitive(node, data.nativeLabels)
              : data.nativeLabels
                ? 'input'
                : '输入集合'}
          </span>
          {pipeline && data.methodReference ? (
            <Button
              variant="ghost"
              className="node-method-link nodrag nopan h-auto max-w-full items-start justify-start gap-1 rounded-none p-0 text-left whitespace-normal hover:bg-transparent"
              onClick={(event) => {
                event.stopPropagation();
                data.methodReference!.onOpen();
              }}
              aria-label={`查看引用流水线 ${title}`}
            >
              <strong title={title}>{title}</strong>
              <ArrowUpRight size={13} />
            </Button>
          ) : (
            <strong title={title}>{title}</strong>
          )}
          {pipeline && node.call && (
            <code className="node-method-version">
              固定版 {node.call.definitionId.slice(0, 8)}
            </code>
          )}
        </div>
      </div>
      {node?.kind === 'branch' && (
        <p
          className="node-condition"
          title={`${node.condition?.field || '整个输入'} ${node.condition?.operator || ''} ${String(node.condition?.value ?? '')}`}
        >
          {node.condition?.field || '整个输入'} ·{' '}
          {data.nativeLabels
            ? node.condition?.operator || 'exists'
            : node.condition?.operator === 'contains'
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
      {responsibility && (
        <p className="node-responsibility" title={responsibility}>
          {responsibility}
        </p>
      )}
      <div className="node-summary">
        <span>
          {node
            ? (pipeline
                ? node.operation === 'map'
                  ? `按 ${labelPort(node.call?.eachPort || 'input')}`
                  : '整批输入'
                : node.kind === 'dynamic'
                  ? `最多 ${node.dynamic?.maxNodes ?? 5} 步`
                  : node.repeat
                    ? `最多 ${node.repeat.max} 轮`
                    : '') ||
              collectionSummary(node) ||
              (node.kind === 'file'
                ? node.file?.name || '未选择文件'
                : node.kind === 'wait'
                  ? node.wait?.event || '等待事件'
                  : node.kind === 'milestone'
                    ? node.milestone?.stage || '记录进展'
                    : node.operation === 'flatMap'
                      ? '逐项产生多项'
                      : node.operation === 'map'
                        ? node.contract?.semanticRole || '逐项处理'
                        : '整批汇总')
            : data.business
              ? '已选输入集合'
              : '原始材料'}
          {data.final && !data.business && (
            <span className="node-final">最终产物</span>
          )}
        </span>
        {node &&
          (data.onInspect ? (
            <Button
              variant="ghost"
              size="sm"
              className="node-instance-link nodrag nopan h-auto p-0"
              aria-label={`查看${title}的执行实例`}
              onClick={(event) => {
                event.stopPropagation();
                data.onInspect!();
              }}
            >
              <Badge status={state || 'queued'}>
                {state === 'waiting'
                  ? '等待事件'
                  : data.progress || statusNames[state || ''] || '待运行'}
              </Badge>
              <ArrowUpRight size={11} />
            </Button>
          ) : (
            <Badge status={state || 'queued'}>
              {state === 'waiting'
                ? '等待事件'
                : data.progress || statusNames[state || ''] || '待运行'}
            </Badge>
          ))}
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
                aria-label={`输入 ${labelPort(port)}`}
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
              <span className="node-port-label" title={labelPort(port)}>
                {labelPort(port)}
              </span>
            </div>
          ))}
        </div>
        <div className="port-column">
          {outputs.map((port) => (
            <div
              key={port}
              className={`node-port output ${data.finalPorts?.includes(port) ? 'node-port-delivery' : ''}`}
              onMouseEnter={() =>
                data.onPortFocus?.({
                  nodeId: id,
                  id: port,
                  direction: 'output',
                })
              }
              onMouseLeave={() => data.onPortFocus?.()}
            >
              <span
                className="node-port-label"
                title={`${data.finalPorts?.includes(port) ? '交付绑定 · ' : ''}${data.outputLabels?.[port] || portLabel(port)}（${port}）`}
              >
                {data.finalPorts?.includes(port) && (
                  <FileOutput
                    size={12}
                    className="node-delivery-mark"
                    aria-label="交付绑定"
                  />
                )}
                {labelOutput(port)}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={port}
                aria-label={`输出 ${labelOutput(port)}`}
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
