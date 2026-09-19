import { useEffect, useState } from 'react';
import { Trash2, ArrowRight } from 'lucide-react';
import type { Definition, FlowNode, Issue, Json } from '../shared/records';
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
      {(node.kind === 'agent' || node.kind === 'function') && (
        <>
          <label className="field">
            处理方式
            <select
              value={
                node.operation || (node.mode === 'all' ? 'aggregate' : 'map')
              }
              onChange={(e) =>
                update({
                  operation: e.target.value as FlowNode['operation'],
                  mode: e.target.value === 'aggregate' ? 'all' : 'each',
                })
              }
            >
              <option value="map">Map · 逐项处理</option>
              <option value="flatMap">FlatMap · 逐项展开</option>
              <option value="aggregate">Aggregate · 整批汇总</option>
            </select>
          </label>
          {(node.operation || node.mode) !== 'aggregate' &&
            node.mode !== 'all' && (
              <label className="field">
                并发数
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={node.concurrency || 1}
                  onChange={(e) =>
                    update({ concurrency: Number(e.target.value) })
                  }
                />
              </label>
            )}
        </>
      )}
      {node.kind === 'wait' && (
        <>
          <label className="field">
            等待事件名称
            <input
              value={node.wait?.event || ''}
              onChange={(e) =>
                update({
                  wait: {
                    event: e.target.value,
                    reason: node.wait?.reason || '',
                    timeoutSeconds: node.wait?.timeoutSeconds,
                  },
                })
              }
            />
          </label>
          <label className="field">
            等待原因
            <textarea
              rows={3}
              value={node.wait?.reason || ''}
              onChange={(e) =>
                update({
                  wait: {
                    event: node.wait?.event || '',
                    reason: e.target.value,
                    timeoutSeconds: node.wait?.timeoutSeconds,
                  },
                })
              }
            />
          </label>
          <label className="field">
            到期时间（秒，可选）
            <input
              type="number"
              min={1}
              value={node.wait?.timeoutSeconds ?? ''}
              onChange={(e) =>
                update({
                  wait: {
                    event: node.wait?.event || '',
                    reason: node.wait?.reason || '',
                    ...(e.target.value
                      ? { timeoutSeconds: Number(e.target.value) }
                      : {}),
                  },
                })
              }
            />
          </label>
        </>
      )}
      {node.kind === 'milestone' && (
        <>
          <label className="field">
            业务阶段
            <input
              value={node.milestone?.stage || ''}
              onChange={(e) =>
                update({
                  milestone: {
                    stage: e.target.value,
                    summary: node.milestone?.summary || '',
                  },
                })
              }
            />
          </label>
          <label className="field">
            进展摘要
            <textarea
              rows={4}
              value={node.milestone?.summary || ''}
              onChange={(e) =>
                update({
                  milestone: {
                    stage: node.milestone?.stage || '',
                    summary: e.target.value,
                  },
                })
              }
            />
          </label>
        </>
      )}
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
                    ? { mode: 'all' as const, operation: 'aggregate' as const }
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
      <details className="details">
        <summary>输入与输出 Schema</summary>
        <p className="muted">
          描述单次调用的值；Map 保留数组，FlatMap 展开一层。
        </p>
        <SchemaField
          label="输入 Schema"
          value={node.inputSchema}
          onSave={(value) => update({ inputSchema: value })}
        />
        <SchemaField
          label="输出 Schema"
          value={node.expectedOutput}
          onSave={(value) => update({ expectedOutput: value })}
        />
      </details>
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

function SchemaField({
  label,
  value,
  onSave,
}: {
  label: string;
  value?: Json;
  onSave: (value: Json | undefined) => void;
}) {
  const serialized = value === undefined ? '' : JSON.stringify(value, null, 2);
  const [text, setText] = useState(serialized);
  const [error, setError] = useState('');
  useEffect(() => {
    setText(serialized);
    setError('');
  }, [serialized]);
  return (
    <label className="field">
      {label}
      <textarea
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          try {
            const parsed = text.trim() ? JSON.parse(text) : undefined;
            onSave(parsed);
            setError('');
          } catch {
            setError('请输入有效的 JSON；尚未保存此结构。');
          }
        }}
      />
      {error && (
        <span role="alert" className="error-text">
          {error}
        </span>
      )}
    </label>
  );
}
