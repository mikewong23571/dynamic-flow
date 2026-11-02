import { useMemo, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import type {
  Definition,
  FlowNode,
  Run,
  ViewState,
  Issue,
} from '../../../../shared/records';
import type { MethodCapability } from '../../../../shared/workitem-composition';
import { nodeInputPorts, nodeOutputPorts } from '../../../../shared/node-ports';
import { WorkflowCanvas } from '../../canvas/WorkflowCanvas';
import { Button } from '../../../components/ui/button';
import { NativeSelect } from '../../../components/ui/native-select';
import { newId } from '../../../core/format';

export function CompositionFlow({
  definition,
  view,
  issues,
  run,
  methods,
  dirty,
  busy,
  onChange,
  onLayout,
  onSave,
  onReset,
  onSelect,
  selected,
  editing = false,
  visible = true,
  outputTitles,
  onMethod,
  onInspectNode,
}: {
  definition: Definition;
  view: ViewState;
  issues: Issue[];
  run?: Run;
  methods: MethodCapability[];
  dirty: boolean;
  busy: boolean;
  selected?: string;
  onSelect: (id?: string) => void;
  onChange: (definition: Definition) => void;
  onLayout: (view: ViewState) => void;
  onSave: () => void;
  onReset: () => void;
  editing?: boolean;
  visible?: boolean;
  outputTitles?: Record<string, string>;
  onMethod: (reference: { workId: string; definitionId: string }) => void;
  onInspectNode?: (nodeId: string) => void;
}) {
  const [method, setMethod] = useState('');
  const methodReferences = useMemo(
    () =>
      Object.fromEntries(
        definition.nodes
          .filter((node) => node.kind === 'call' && node.call)
          .map((node) => {
            const reference = node.call!;
            const target = methods.find(
              (method) =>
                method.workId === reference.workId &&
                method.definitionId === reference.definitionId,
            );
            return [
              node.id,
              {
                title: target?.title || '流水线暂不可用',
                onOpen: () => onMethod(reference),
              },
            ];
          }),
      ),
    [definition, methods, onMethod],
  );
  function add(kind: 'agent' | 'function' | 'call') {
    const chosen = methods.find(
      (entry) => `${entry.workId}:${entry.definitionId}` === method,
    );
    if (kind === 'call' && !chosen) return;
    const node: FlowNode = {
      id: newId(),
      kind,
      label:
        kind === 'call'
          ? chosen!.title
          : kind === 'agent'
            ? '分析处理'
            : '整理数据',

      ...(kind === 'call'
        ? {
            operation: 'aggregate' as const,
            call: {
              workId: chosen!.workId,
              definitionId: chosen!.definitionId,
              inputNames: chosen!.inputs,
              outputNames: chosen!.outputs,
            },
          }
        : kind === 'agent'
          ? { task: '' }
          : { functionName: 'identity' as const }),
    };
    const previous = definition.nodes.at(-1);
    const previousOutput = previous && nodeOutputPorts(previous)[0];
    const input = nodeInputPorts(node)[0];
    const from =
      previous && previousOutput
        ? ([previous.id, previousOutput] as [string, string])
        : definition.inputs[0]
          ? (['$input', definition.inputs[0]] as [string, string])
          : undefined;
    const output = nodeOutputPorts(node)[0];
    onChange({
      ...definition,
      nodes: [...definition.nodes, node],
      edges: [
        ...definition.edges,
        ...(from && input
          ? [{ from, to: [node.id, input] as [string, string] }]
          : []),
      ],
      outputs: output
        ? { ...definition.outputs, result: [node.id, output] }
        : definition.outputs,
    });
    onSelect(node.id);
  }
  return (
    <div className="composition-flow">
      {editing && (
        <div className="composition-flow-tools">
          <div className="inline-group">
            <NativeSelect
              aria-label="选择可复用方法"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              <option value="">选择已有方法…</option>
              {methods.map((entry) => (
                <option
                  key={`${entry.workId}:${entry.definitionId}`}
                  value={`${entry.workId}:${entry.definitionId}`}
                >
                  {entry.title} · {entry.adopted ? '采用版' : '保存版'}{' '}
                  {entry.definitionId.slice(0, 6)}
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="outline"
              disabled={!method || busy}
              onClick={() => add('call')}
            >
              <Plus size={14} />
              调用方法
            </Button>
          </div>
          <div className="inline-group">
            <Button
              variant="outline"
              disabled={busy || !editing}
              onClick={() => add('agent')}
            >
              添加分析
            </Button>
            <Button
              variant="outline"
              disabled={busy || !editing}
              onClick={() => add('function')}
            >
              添加数据步骤
            </Button>
          </div>
          <div className="inline-group composition-flow-save">
            {dirty ? (
              <>
                <Button variant="ghost" disabled={busy} onClick={onReset}>
                  放弃修改
                </Button>
                <Button variant="outline" disabled={busy} onClick={onSave}>
                  <Save size={14} />
                  保存流程
                </Button>
              </>
            ) : (
              <span className="muted">已保存</span>
            )}
          </div>
        </div>
      )}
      {!!issues.length && (
        <div role="alert" className="composition-flow-issues">
          {issues.map((issue, index) => (
            <button
              key={index}
              onClick={() => {
                onSelect(issue.nodeId);
              }}
            >
              {issue.message}
            </button>
          ))}
        </div>
      )}
      <div className="composition-flow-editor">
        <WorkflowCanvas
          definition={definition}
          nativeLabels
          presentation={editing ? undefined : 'business'}
          outputTitles={outputTitles}
          methodReferences={methodReferences}
          onInspectNode={onInspectNode}
          visible={visible}
          view={view}
          run={run}
          selected={selected}
          onSelect={(id) => {
            onSelect(id);
          }}
          onChange={onChange}
          onLayout={onLayout}
          disabled={busy || !editing}
        />
      </div>
    </div>
  );
}
