import './NodeInspector.css';
import { Textarea } from '../../components/ui/textarea';
import { Input } from '../../components/ui/input';
import { Field } from '../../components/ui/field';
import type { MethodCapability } from '../../../shared/workitem-composition';
import { runResultSummarySchema } from '../../../shared/result-summary';
import { SemanticFields, ProblemEditor } from './SemanticFields';
import { useEffect, useState } from 'react';
import { Trash2, ArrowRight } from 'lucide-react';
import type {
  Definition,
  FlowNode,
  Issue,
  Json,
} from '../../../shared/records';
import { inputPorts, outputPorts } from '../../core/inputs';
import { isFinalOutput, nodeLabel, removeNode } from '../../core/definition';
import { portLabel } from '../../core/format';
import { Button } from '../../components/ui/button';
import { ExpressionEditor } from './ExpressionEditor';
import { variable } from './expression-model';
import { CollectionEditor } from './CollectionEditor';
import { changeFunction } from './collection-model';
import { collectionFunction } from '../../../shared/node-ports';
import { api } from '../../core/api';
import { NativeSelect } from '../../components/ui/native-select';
function FileNodeConfig({
  workId,
  node,
  update,
}: {
  workId?: string;
  node: FlowNode;
  update: (patch: Partial<FlowNode>) => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  useEffect(() => {
    if (!workId) return;
    void api<{ files: string[] }>(`/api/works/${workId}/uploads`)
      .then((data) => setFiles(data.files))
      .catch(() => setFiles([]));
  }, [workId]);
  return (
    <Field>
      工作文件
      <NativeSelect
        value={node.file?.name ?? ''}
        onChange={(event) => update({ file: { name: event.target.value } })}
      >
        <option value="">选择 uploads 中的文件…</option>
        {files.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </NativeSelect>
      {node.file?.name && !files.includes(node.file.name) && (
        <span className="inline-error">
          文件 {node.file.name} 不在工作文件中。
        </span>
      )}
    </Field>
  );
}
export function NodeInspector({
  definition,
  nodeId,
  issues,
  onChange,
  onChat,
  workId,
  methods = [],
}: {
  definition: Definition;
  nodeId?: string;
  issues: Issue[];
  onChange: (d: Definition) => void;
  onChat: () => void;
  workId?: string;
  methods?: MethodCapability[];
}) {
  const node = definition.nodes.find((n) => n.id === nodeId);
  if (!node)
    return <ProblemEditor definition={definition} onChange={onChange} />;
  const update = (patch: Partial<FlowNode>) =>
    onChange({
      ...definition,
      nodes: definition.nodes.map((n) =>
        n.id === node.id ? { ...n, ...patch } : n,
      ),
    });
  return (
    <div className="inspector scroll">
      <div className="section-heading">
        <h2>{node.label}</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange(removeNode(definition, node.id))}
          title="删除节点"
          aria-label="删除节点"
        >
          <Trash2 size={16} />
        </Button>
      </div>
      <Field>
        步骤名称
        <Input
          value={node.label}
          onChange={(e) => update({ label: e.target.value })}
        />
      </Field>
      <SemanticFields node={node} update={update} />
      {node.kind === 'call' && (
        <section className="stack" aria-label="方法调用配置">
          <Field>
            调用的方法
            <NativeSelect
              value={
                node.call ? `${node.call.workId}:${node.call.definitionId}` : ''
              }
              onChange={(event) => {
                const method = methods.find(
                  (entry) =>
                    `${entry.workId}:${entry.definitionId}` ===
                    event.target.value,
                );
                if (method)
                  update({
                    call: {
                      workId: method.workId,
                      definitionId: method.definitionId,
                      inputNames: method.inputs,
                      outputNames: method.outputs,
                    },
                    label: method.title,
                  });
              }}
            >
              <option
                value={
                  node.call
                    ? `${node.call.workId}:${node.call.definitionId}`
                    : ''
                }
              >
                {methods.find((entry) => entry.workId === node.call?.workId)
                  ?.title || '已固定的方法'}
              </option>
              {methods
                .filter(
                  (entry) =>
                    entry.definitionId !== node.call?.definitionId ||
                    entry.workId !== node.call?.workId,
                )
                .map((entry) => (
                  <option
                    key={`${entry.workId}:${entry.definitionId}`}
                    value={`${entry.workId}:${entry.definitionId}`}
                  >
                    {entry.title} · {entry.adopted ? '采用版' : '保存版'}{' '}
                    {entry.definitionId.slice(0, 6)}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field>
            处理范围
            <NativeSelect
              value={node.operation || 'aggregate'}
              onChange={(event) =>
                update({
                  operation: event.target.value as 'aggregate' | 'map',

                  call: node.call
                    ? {
                        ...node.call,
                        eachPort: node.call.eachPort || node.call.inputNames[0],
                      }
                    : undefined,
                })
              }
            >
              <option value="aggregate">整批调用一次</option>
              <option value="map">逐项调用</option>
            </NativeSelect>
          </Field>
          {node.operation === 'map' && (
            <Field>
              逐项处理的输入
              <NativeSelect
                value={node.call?.eachPort || node.call?.inputNames[0] || ''}
                onChange={(event) =>
                  node.call &&
                  update({
                    call: { ...node.call, eachPort: event.target.value },
                  })
                }
              >
                {node.call?.inputNames.map((port) => (
                  <option key={port} value={port}>
                    {portLabel(port)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <small className="meta-text">
            固定版本 {node.call?.definitionId.slice(0, 8)}
          </small>
        </section>
      )}
      {node.kind === 'file' && (
        <FileNodeConfig workId={workId} node={node} update={update} />
      )}
      {(node.kind === 'agent' ||
        (node.kind === 'function' &&
          !collectionFunction(node) &&
          node.functionName !== 'merge')) && (
        <>
          <Field>
            处理方式
            <NativeSelect
              value={node.operation || 'map'}
              onChange={(e) =>
                update({
                  operation: e.target.value as FlowNode['operation'],
                })
              }
            >
              <option value="map">逐项处理</option>
              <option value="flatMap">逐项产生多项</option>
              <option value="aggregate">整批处理</option>
            </NativeSelect>
          </Field>
          {node.operation !== 'aggregate' && (
            <Field>
              并发数
              <Input
                type="number"
                min={1}
                max={8}
                value={node.concurrency || 1}
                onChange={(e) =>
                  update({ concurrency: Number(e.target.value) })
                }
              />
            </Field>
          )}
        </>
      )}
      {node.kind === 'wait' && (
        <>
          <Field>
            等待事件名称
            <Input
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
          </Field>
          <Field>
            等待原因
            <Textarea
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
          </Field>
          <Field>
            到期时间（秒，可选）
            <Input
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
          </Field>
        </>
      )}
      {node.kind === 'milestone' && (
        <>
          <Field>
            业务阶段
            <Input
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
          </Field>
          <Field>
            进展摘要
            <Textarea
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
          </Field>
        </>
      )}
      {node.kind === 'agent' && (
        <>
          <Field>
            任务要求
            <Textarea
              rows={7}
              value={node.task || ''}
              onChange={(e) => update({ task: e.target.value })}
            />
          </Field>
        </>
      )}
      {node.kind === 'function' && (
        <>
          <Field>
            处理函数
            <NativeSelect
              value={node.functionName || 'identity'}
              onChange={(e) =>
                onChange(
                  changeFunction(
                    definition,
                    node.id,
                    e.target.value as FlowNode['functionName'],
                  ),
                )
              }
            >
              <option value="identity">原样传递</option>
              <option value="expression">数据变换</option>
              <option value="select-fields">提取字段</option>
              <option value="merge">多路汇合</option>
              <option value="collect">具名收集</option>
              <option value="join">按键关联</option>
              <option value="groupBy">按字段分组</option>
            </NativeSelect>
          </Field>
          {['merge', 'collect', 'join'].includes(node.functionName || '') && (
            <CollectionEditor
              node={node}
              definition={definition}
              onChange={onChange}
            />
          )}
          {node.functionName === 'groupBy' && (
            <Field>
              分组字段（每行一项）
              <Textarea
                aria-label="分组字段"
                rows={3}
                value={
                  node.groupBy?.keys.map((path) => path.join('.')).join('\n') ||
                  ''
                }
                onChange={(event) =>
                  update({
                    groupBy: {
                      keys: event.target.value
                        .split('\n')
                        .filter(Boolean)
                        .map((field) => field.split('.')),
                    },

                    operation: 'aggregate',
                  })
                }
              />
            </Field>
          )}
          {node.functionName === 'expression' && (
            <ExpressionEditor
              key={node.id}
              value={node.expression || variable()}
              onChange={(expression) => update({ expression })}
            />
          )}
          {node.functionName === 'select-fields' && (
            <Field>
              字段（逗号分隔）
              <Input
                value={node.params?.fields?.join(', ') || ''}
                onChange={(e) =>
                  update({
                    params: {
                      fields: e.target.value.split(',').map((x) => x.trim()),
                    },
                  })
                }
              />
            </Field>
          )}
        </>
      )}
      {node.kind === 'branch' && (
        <>
          <Field>
            判断字段
            <Input
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
          </Field>
          <Field>
            条件
            <NativeSelect
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
            </NativeSelect>
          </Field>
          {node.condition?.operator !== 'exists' && (
            <Field>
              值
              <Input
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
            </Field>
          )}
        </>
      )}
      {node.kind === 'create-items' && (
        <dl className="stack">
          <div>
            <dt>输入</dt>
            <dd>问题候选清单</dd>
          </div>
          <div>
            <dt>建立到</dt>
            <dd>当前工作项的子项</dd>
          </div>
          <div>
            <dt>输出</dt>
            <dd>建立结果与子项入口</dd>
          </div>
        </dl>
      )}
      {node.kind !== 'create-items' && (
        <details className="details">
          <summary>输入与输出 Schema</summary>
          <p className="meta-text">
            {collectionFunction(node)
              ? node.functionName === 'collect'
                ? '输入和输出均为具名数组对象；输出对象作为一项。'
                : '输入为具名数组对象；输出 Schema 描述整批数组。'
              : '描述单次调用的值；Map 保留数组，FlatMap 展开一层。'}
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
                {nodeLabel(definition, e.from[0])}
                <small>{portLabel(e.from[1])}</small>
              </span>
              <ArrowRight size={14} />
              <span>
                {nodeLabel(definition, e.to[0])}
                <small>{portLabel(e.to[1])}</small>
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`删除连接 ${nodeLabel(definition, e.from[0])} 到 ${nodeLabel(definition, e.to[0])}`}
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
          key={`${node.id}:${node.functionName}:${JSON.stringify(inputPorts(node))}`}
          definition={definition}
          node={node}
          onChange={onChange}
        />
      </details>
      <label className="check-row">
        <input
          type="checkbox"
          checked={isFinalOutput(definition, node.id)}
          onChange={(e) =>
            onChange({
              ...definition,
              summaryOutput:
                !e.target.checked &&
                definition.summaryOutput &&
                definition.outputs[definition.summaryOutput]?.[0] === node.id
                  ? undefined
                  : definition.summaryOutput,
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
      {['agent', 'function'].includes(node.kind) &&
        node.operation === 'aggregate' &&
        !node.repeat &&
        !node.dynamic && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={
                !!definition.summaryOutput &&
                definition.outputs[definition.summaryOutput]?.[0] === node.id
              }
              onChange={(event) => {
                let alias = Object.entries(definition.outputs).find(
                  ([, target]) =>
                    target[0] === node.id && target[1] === 'output',
                )?.[0];
                if (!alias) {
                  alias = node.label;
                  for (
                    let suffix = 2;
                    Object.hasOwn(definition.outputs, alias);
                    suffix++
                  )
                    alias = `${node.label} ${suffix}`;
                }
                onChange({
                  ...definition,
                  summaryOutput: event.target.checked ? alias : undefined,
                  outputs: event.target.checked
                    ? { ...definition.outputs, [alias]: [node.id, 'output'] }
                    : definition.outputs,
                  nodes: event.target.checked
                    ? definition.nodes.map((n) =>
                        n.id === node.id
                          ? { ...n, expectedOutput: runResultSummarySchema }
                          : n,
                      )
                    : definition.nodes,
                });
              }}
            />
            作为本轮结果摘要
            <small>
              启用时设置摘要结构约束；节点需返回标题、摘要与本轮范围。
            </small>
          </label>
        )}
      {issues
        .filter((i) => i.nodeId === node.id)
        .map((issue, i) => (
          <p className="inline-error" key={i}>
            {issue.message}
          </p>
        ))}
      <Button variant="outline" size="sm" onClick={onChat} className="w-full">
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
      <Field>
        来自
        <NativeSelect value={from} onChange={(e) => setFrom(e.target.value)}>
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
        </NativeSelect>
      </Field>
      <Field>
        输入端口
        <NativeSelect value={to} onChange={(e) => setTo(e.target.value)}>
          {inputPorts(node).map((p) => (
            <option key={p} value={p}>
              {portLabel(p)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Button
        variant="outline"
        size="sm"
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
    <Field>
      {label}
      <Textarea
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
    </Field>
  );
}
