import { useState } from 'react';
import { Trash2, ArrowRight } from 'lucide-react';
import type { Definition, FlowNode, Issue } from '../shared/records';
import { inputPorts, outputPorts, removeNode, portLabel } from './model';
import { Button, Empty } from './components/ui';
export function NodeInspector({
  definition,
  nodeId,
  issues,
  onChange,
  onChat,
}: {
  definition: Definition;
  nodeId?: string;
  issues: Issue[];
  onChange: (d: Definition) => void;
  onChat: () => void;
}) {
  const node = definition.nodes.find((n) => n.id === nodeId);
  const [schemaError, setSchemaError] = useState('');
  if (!node)
    return (
      <Empty title="选择一个步骤">
        <p>点击画布节点，查看任务、连接和参数。</p>
      </Empty>
    );
  const update = (patch: Partial<FlowNode>) =>
    onChange({
      ...definition,
      nodes: definition.nodes.map((n) =>
        n.id === node.id ? { ...n, ...patch } : n,
      ),
    });
  const label = (id: string) =>
    id === '$input'
      ? '工作材料'
      : definition.nodes.find((n) => n.id === id)?.label || id;
  return (
    <div className="inspector scroll">
      <div className="section-heading">
        <h2>{node.label}</h2>
        <Button
          variant="ghost"
          onClick={() => onChange(removeNode(definition, node.id))}
          title="删除节点"
          aria-label="删除节点"
        >
          <Trash2 size={16} />
        </Button>
      </div>
      <label className="field">
        步骤名称
        <input
          value={node.label}
          onChange={(e) => update({ label: e.target.value })}
        />
      </label>
      <label className="field">
        处理方式
        <select
          value={node.mode}
          disabled={node.kind === 'branch'}
          onChange={(e) => update({ mode: e.target.value as FlowNode['mode'] })}
        >
          <option value="each">逐条处理</option>
          <option value="all">汇总处理</option>
        </select>
      </label>
      {node.kind === 'agent' && (
        <>
          <label className="field">
            任务要求
            <textarea
              rows={7}
              value={node.task || ''}
              onChange={(e) => update({ task: e.target.value })}
            />
          </label>
          <details className="details">
            <summary>结果结构（可选）</summary>
            <label className="field">
              JSON Schema
              <textarea
                key={node.id}
                rows={5}
                defaultValue={
                  node.expectedOutput
                    ? JSON.stringify(node.expectedOutput, null, 2)
                    : ''
                }
                onBlur={(e) => {
                  try {
                    update({
                      expectedOutput: e.target.value
                        ? JSON.parse(e.target.value)
                        : undefined,
                    });
                    setSchemaError('');
                  } catch {
                    setSchemaError('结构格式不正确，请检查 JSON。');
                  }
                }}
              />
            </label>
            {schemaError && <p className="error-text">{schemaError}</p>}
          </details>
        </>
      )}
      {node.kind === 'function' && (
        <>
          <label className="field">
            处理函数
            <select
              value={node.functionName || 'identity'}
              onChange={(e) =>
                update({
                  functionName: e.target.value as FlowNode['functionName'],
                  ...(e.target.value === 'merge'
                    ? { mode: 'all' as const }
                    : {}),
                })
              }
            >
              <option value="identity">原样传递</option>
              <option value="select-fields">提取字段</option>
              <option value="merge">合并两路输入</option>
            </select>
          </label>
          {node.functionName === 'select-fields' && (
            <label className="field">
              字段（逗号分隔）
              <input
                value={node.params?.fields?.join(', ') || ''}
                onChange={(e) =>
                  update({
                    params: {
                      fields: e.target.value.split(',').map((x) => x.trim()),
                    },
                  })
                }
              />
            </label>
          )}
        </>
      )}
      {node.kind === 'branch' && (
        <>
          <label className="field">
            判断字段
            <input
              value={node.condition?.field || ''}
              onChange={(e) =>
                update({
                  condition: {
                    operator: 'equals',
                    ...node.condition,
                    field: e.target.value,
                  },
                })
              }
              placeholder="例如 category"
            />
          </label>
          <label className="field">
            条件
            <select
              value={node.condition?.operator || 'equals'}
              onChange={(e) =>
                update({
                  condition: {
                    field: '',
                    ...node.condition,
                    operator: e.target.value as
                      'equals' | 'contains' | 'exists',
                  },
                })
              }
            >
              <option value="equals">等于</option>
              <option value="contains">包含</option>
              <option value="exists">存在</option>
            </select>
          </label>
          {node.condition?.operator !== 'exists' && (
            <label className="field">
              值
              <input
                value={String(node.condition?.value ?? '')}
                onChange={(e) =>
                  update({
                    condition: {
                      field: '',
                      operator: 'equals',
                      ...node.condition,
                      value: e.target.value,
                    },
                  })
                }
              />
            </label>
          )}
        </>
      )}
      <div className="section-heading">
        <h3>数据连接</h3>
      </div>
      <div className="connections">
        {definition.edges
          .filter((e) => e.from[0] === node.id || e.to[0] === node.id)
          .map((e) => (
            <div key={JSON.stringify(e)}>
              <span>
                {label(e.from[0])}
                <small>{portLabel(e.from[1])}</small>
              </span>
              <ArrowRight size={14} />
              <span>
                {label(e.to[0])}
                <small>{portLabel(e.to[1])}</small>
              </span>
              <Button
                variant="ghost"
                aria-label={`删除连接 ${label(e.from[0])} 到 ${label(e.to[0])}`}
                onClick={() =>
                  onChange({
                    ...definition,
                    edges: definition.edges.filter((v) => v !== e),
                  })
                }
              >
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
      </div>
      <details className="details">
        <summary>添加连接</summary>
        <ConnectionForm
          key={`${node.id}:${node.functionName}`}
          definition={definition}
          node={node}
          onChange={onChange}
        />
      </details>
      <label className="check-row">
        <input
          type="checkbox"
          checked={Object.values(definition.outputs).some(
            (v) => v[0] === node.id,
          )}
          onChange={(e) =>
            onChange({
              ...definition,
              outputs: e.target.checked
                ? {
                    ...definition.outputs,
                    [node.label]: [node.id, outputPorts(node)[0]],
                  }
                : Object.fromEntries(
                    Object.entries(definition.outputs).filter(
                      ([, v]) => v[0] !== node.id,
                    ),
                  ),
            })
          }
        />
        作为最终产物
      </label>
      {issues
        .filter((i) => i.nodeId === node.id)
        .map((issue, i) => (
          <p className="inline-error" key={i}>
            {issue.message}
          </p>
        ))}
      <Button onClick={onChat} className="full-width">
        对话修改此步骤
      </Button>
    </div>
  );
}
function ConnectionForm({
  definition,
  node,
  onChange,
}: {
  definition: Definition;
  node: FlowNode;
  onChange: (d: Definition) => void;
}) {
  const [from, setFrom] = useState('$input::' + definition.inputs[0]);
  const [to, setTo] = useState(inputPorts(node)[0]);
  return (
    <div className="stack">
      <label className="field">
        来自
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          {definition.inputs.map((p) => (
            <option key={p} value={`$input::${p}`}>
              工作材料 · {portLabel(p)}
            </option>
          ))}
          {definition.nodes.map((n) =>
            outputPorts(n).map((p) => (
              <option key={`${n.id}::${p}`} value={`${n.id}::${p}`}>
                {n.label} · {portLabel(p)}
              </option>
            )),
          )}
        </select>
      </label>
      <label className="field">
        输入端口
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {inputPorts(node).map((p) => (
            <option key={p} value={p}>
              {portLabel(p)}
            </option>
          ))}
        </select>
      </label>
      <Button
        onClick={() =>
          onChange({
            ...definition,
            edges: [
              ...definition.edges,
              { from: from.split('::') as [string, string], to: [node.id, to] },
            ],
          })
        }
      >
        连接到此步骤
      </Button>
    </div>
  );
}
