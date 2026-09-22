import { materializeDefinition } from '../../../shared/expansion';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownTable } from '../../components/MarkdownTable';
import { Copy, ChevronRight, ArrowRight } from 'lucide-react';
import type {
  Definition,
  Inputs,
  Json,
  ModelConfiguration,
  NodeResult,
  Work,
} from '../../../shared/records';
import { resultItems, nodeTotal } from '../../core/results';
import { isFinalOutput } from '../../core/definition';
import { active, short, statusNames } from '../../core/format';
import { Badge, Button, Empty } from '../../components/ui';
import { effectiveModelLabel } from '../settings/catalog-model';

/** 展开实例的全部输入端口并按字段去重，用于展示材料与来源引用。 */
function inputRefs(
  input: Inputs,
  field: 'materialIds' | 'sourceResultIds',
): string[] {
  return [
    ...new Set(
      Object.values(input)
        .flat()
        .flatMap((item) => item[field]),
    ),
  ];
}
export function Value({ value }: { value: Json }) {
  if (typeof value === 'string')
    return (
      <div className="prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{ table: MarkdownTable }}
        >
          {value}
        </ReactMarkdown>
      </div>
    );
  if (value === null || typeof value !== 'object')
    return <span>{String(value)}</span>;
  if (Array.isArray(value))
    return (
      <div className="value-list">
        {value.map((v, i) => (
          <Value key={i} value={v} />
        ))}
      </div>
    );
  return (
    <dl className="value-object">
      {Object.entries(value).map(([key, v]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>
            <Value value={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function InputContent({ inputs }: { inputs: Inputs }) {
  return (
    <div className="input-content">
      {Object.entries(inputs).map(([port, items]) => (
        <div key={port}>
          {Object.keys(inputs).length > 1 && <h4>端口 · {port}</h4>}
          {items.length === 0 && <span className="muted">无输入</span>}
          {items.map((item, i) => (
            <div className="sample-content" key={`${item.sampleId}-${i}`}>
              <span className="sample-id">
                {item.materialIds.join(' · ') ||
                  (item.sourceResultIds.length
                    ? item.sampleId
                    : `直接输入 · ${item.sampleId}`)}
              </span>
              <Value value={item.value} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
export function Results({
  work,
  definitions,
  selectedRun,
  onRunSelect,
  selectedResults,
  onSelectResults,
  onAction,
  onCandidate,
  onContinue,
  onInvoke,
  selectedDefinitionId,
  configuration,
  onOpenSettings,
}: {
  work: Work;
  definitions: Record<string, Definition>;
  selectedRun?: string;
  onRunSelect: (id: string) => void;
  selectedResults: string[];
  onSelectResults: (ids: string[]) => void;
  onAction: (
    action: string,
    fields?: Record<string, unknown>,
  ) => Promise<unknown>;
  onCandidate: (result: NodeResult) => void;
  onContinue: () => void;
  onInvoke?: () => void;
  selectedDefinitionId?: string;
  configuration?: ModelConfiguration | null;
  onOpenSettings?: () => void;
}) {
  const run =
    work.runs.find((r) => r.id === selectedRun) ||
    work.runs[work.runs.length - 1];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState('');
  if (!run)
    return (
      <Empty title="还没有运行结果">
        <p>选择材料，运行流程后将在这里看到逐条进展。</p>
        {onInvoke && (
          <Button variant="primary" onClick={onInvoke}>
            直接输入运行
          </Button>
        )}
      </Empty>
    );
  const original = definitions[run.definitionId];
  const def = original
    ? materializeDefinition(original, run.expansions ?? [])
    : undefined;
  const toggle = (id: string) =>
    onSelectResults(
      selectedResults.includes(id)
        ? selectedResults.filter((x) => x !== id)
        : [...selectedResults, id],
    );
  return (
    <div className="results-view">
      <div className="results-toolbar">
        <label>
          运行记录
          <select
            aria-label="运行记录"
            value={run.id}
            onChange={(e) => onRunSelect(e.target.value)}
          >
            {[...work.runs].reverse().map((r, i) => (
              <option key={r.id} value={r.id}>
                {new Date(r.startedAt).toLocaleTimeString()} ·{' '}
                {r.scope === 'full'
                  ? '完整流程'
                  : definitions[r.definitionId]?.nodes.find(
                      (n) =>
                        n.id ===
                        (typeof r.scope === 'object' ? r.scope.nodeId : ''),
                    )?.label || '单节点'}{' '}
                · {statusNames[r.status]} · {short(r.definitionId)}
                {r.invocation?.loose ? ' · 宽松调用' : ''}
                {r.invocation?.repairedPorts?.length ? ' · 自动修复' : ''}
              </option>
            ))}
          </select>
        </label>
        <Badge status={run.status} />
        {active(run.status) && (
          <Button
            onClick={() => void onAction('stopRun', { runId: run.id })}
            disabled={run.stopRequested}
          >
            停止运行
          </Button>
        )}
      </div>
      <div className="run-meta">
        <span>
          做法 {short(run.definitionId)} ·{' '}
          {run.definitionId === work.adoptedId
            ? '当前采用'
            : run.definitionId === work.draftId
              ? '候选'
              : '历史版本'}
        </span>
        <span>
          {run.results.filter((r) => r.status === 'completed').length} 条完成 /{' '}
          {run.results.length} 个执行实例
        </span>
        <span>输入 {Object.values(run.inputs).flat().length} 条</span>
        {run.invocation?.loose && <span>宽松调用（豁免入口契约）</span>}
        {!!run.invocation?.repairedPorts?.length && (
          <span>
            端口 {run.invocation.repairedPorts.join('、')} 经自动修复
          </span>
        )}
      </div>
      {run.error && <p className="inline-error">{run.error}</p>}
      <div className="scroll results-body">
        {run.workItem && (
          <div className="run-business-context">
            <strong>
              {run.workItem.key} · {run.workItem.title}
            </strong>
            <span>
              工作项输入修订 {run.workItem.revision} ·{' '}
              {run.effectMode === 'commit' ? '正式推进' : '试运行'}
            </span>
          </div>
        )}
        {!!run.waits?.length && (
          <details className="details" open={run.status === 'waiting'}>
            <summary>等待与触发记录</summary>
            {run.waits.map((wait) => (
              <div className="run-wait-record" key={wait.nodeId}>
                <strong>{wait.reason}</strong>
                <p>
                  {wait.event} ·{' '}
                  {wait.status === 'pending'
                    ? '等待中'
                    : wait.releasedBy === 'timer'
                      ? '到期已继续'
                      : '事件已继续'}
                  {wait.dueAt
                    ? ` · 到期 ${new Date(wait.dueAt).toLocaleString()}`
                    : ''}
                </p>
              </div>
            ))}
            {run.signals?.map((signal) => (
              <div className="run-wait-record" key={signal.id}>
                <strong>{signal.name}</strong>
                <p>
                  接收于 {new Date(signal.receivedAt).toLocaleString()} ·{' '}
                  {signal.id}
                </p>
                {signal.payload !== undefined && (
                  <Value value={signal.payload} />
                )}
              </div>
            ))}
          </details>
        )}
        {original?.problem && (
          <details className="details">
            <summary>本次固定的问题认知</summary>
            <Value
              value={{
                当前问题: original.problem.framing,
                已知事实: original.problem.known,
                仍待确认: original.problem.unknown,
                约束: original.problem.constraints,
                依据与来源: original.problem.evidence,
              }}
            />
          </details>
        )}
        {run.expansions?.map((expansion) => (
          <details className="details" key={expansion.nodeId} open>
            <summary>
              实际展开 ·{' '}
              {original?.nodes.find((n) => n.id === expansion.nodeId)?.label}
            </summary>
            <ol>
              {expansion.definition.nodes.map((node) => (
                <li key={node.id}>
                  <strong>{node.label}</strong>
                  <p>{node.contract?.responsibility}</p>
                  <p className="muted">完成：{node.contract?.done}</p>
                  <p className="muted">依据：{node.contract?.rationale}</p>
                </li>
              ))}
            </ol>
            <p className="muted">
              {expansion.definition.edges
                .map(
                  (e) =>
                    `${e.from[0] === '$input' ? '输入' : expansion.definition.nodes.find((n) => n.id === e.from[0])?.label} → ${expansion.definition.nodes.find((n) => n.id === e.to[0])?.label}`,
                )
                .join('；')}
            </p>
            <Button
              disabled={
                run.nodeStates[expansion.nodeId] !== 'completed' ||
                !definitions[work.draftId ?? work.adoptedId ?? '']?.nodes.some(
                  (n) => n.id === expansion.nodeId && n.kind === 'dynamic',
                )
              }
              onClick={() =>
                void onAction('freezeExpansion', {
                  expectedDraftId: work.draftId,
                  runId: run.id,
                  nodeId: expansion.nodeId,
                })
              }
            >
              把展开写为候选
            </Button>
          </details>
        ))}
        {Object.entries(run.nodeStates).map(([id, state]) => (
          <div className="step-progress" key={id}>
            <span>{def?.nodes.find((n) => n.id === id)?.label || id}</span>
            <Badge status={state} />
            <span>
              {
                run.results.filter(
                  (r) =>
                    r.nodeId === id &&
                    r.status === 'completed' &&
                    !r.intermediate &&
                    !r.purpose,
                ).length
              }{' '}
              / {nodeTotal(run, id)} 个实例
            </span>
          </div>
        ))}
        {run.results.map((result) => {
          const parentDynamic = run.expansions?.find((e) =>
            result.nodeId.startsWith(`${e.nodeId}/`),
          )?.nodeId;
          const final =
            !result.intermediate &&
            !result.purpose &&
            isFinalOutput(def, result.nodeId);
          return (
            <article
              className={`result-card ${final ? 'final-result' : ''}`}
              key={result.id}
            >
              <header>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={selectedResults.includes(result.id)}
                    disabled={result.status !== 'completed' || !!result.purpose}
                    onChange={() => toggle(result.id)}
                  />
                  <strong>
                    {def?.nodes.find((n) => n.id === result.nodeId)?.label ||
                      result.nodeId}
                  </strong>
                </label>
                {result.purpose && <Badge>生成计划</Badge>}
                {result.iteration && (
                  <Badge>
                    第 {result.iteration} 轮
                    {result.intermediate ? ' · 中间结果' : ''}
                  </Badge>
                )}
                {final && <Badge>最终产物</Badge>}
                <Badge status={result.status} />
                <span className="muted">
                  {inputRefs(result.input, 'materialIds').join(' · ')}
                </span>
              </header>
              {result.error && <p className="inline-error">{result.error}</p>}
              {result.purpose && result.proposedDefinition && (
                <details className="details">
                  <summary>生成的提案</summary>
                  <pre>
                    {JSON.stringify(result.proposedDefinition, null, 2)}
                  </pre>
                </details>
              )}
              {result.effectiveModel && (
                <p className="muted result-model">
                  {effectiveModelLabel(
                    result.effectiveModel,
                    configuration?.catalog ?? [],
                  )}
                </p>
              )}
              {resultItems(result).map((item, i) => (
                <div className="result-output" key={i}>
                  <Value value={item.value} />
                </div>
              ))}
              {result.status !== 'completed' &&
                resultItems(result).length === 0 && (
                  <p className="muted">
                    {active(result.status)
                      ? '正在处理这条输入…'
                      : '此实例没有完整产物。'}
                  </p>
                )}
              <div className="result-actions">
                <Button
                  variant="ghost"
                  onClick={() =>
                    setExpanded({
                      ...expanded,
                      [result.id]: !expanded[result.id],
                    })
                  }
                >
                  <ChevronRight
                    size={14}
                    className={expanded[result.id] ? 'rotate' : ''}
                  />
                  输入与来源
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    onCandidate(
                      parentDynamic
                        ? { ...result, nodeId: parentDynamic }
                        : result,
                    )
                  }
                >
                  {parentDynamic ? '改进所属动态步骤' : '从此结果改进'}
                </Button>
                {result.status === 'failed' &&
                  original?.nodes.some((n) => n.id === result.nodeId) && (
                    <>
                      <Button
                        onClick={() =>
                          void onAction('retry', {
                            runId: run.id,
                            resultIds: [result.id],
                            definitionId:
                              selectedDefinitionId || run.definitionId,
                          })
                        }
                      >
                        用所选做法重试此输入
                      </Button>
                      {result.effectiveModel && onOpenSettings && (
                        <Button variant="ghost" onClick={onOpenSettings}>
                          检查模型设置
                        </Button>
                      )}
                    </>
                  )}
                {result.status === 'completed' && !result.purpose && (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void onAction('keepResults', { resultIds: [result.id] })
                      }
                    >
                      {work.keptResultIds.includes(result.id)
                        ? '已保留'
                        : '保留此结果'}
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label="复制结果"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(
                            resultItems(result)
                              .map((i) =>
                                typeof i.value === 'string'
                                  ? i.value
                                  : JSON.stringify(i.value, null, 2),
                              )
                              .join('\n\n'),
                          )
                          .then(() => setCopied(result.id));
                      }}
                    >
                      <Copy size={14} />
                      {copied === result.id ? '已复制' : '复制'}
                    </Button>
                  </>
                )}
              </div>
              {expanded[result.id] && (
                <div className="result-detail">
                  <h4>实际输入</h4>
                  <InputContent inputs={result.input} />
                  <p className="muted">
                    运行 {short(result.runId)} · 做法{' '}
                    {short(result.definitionId)} · 实例{' '}
                    {short(result.instanceId)}
                  </p>
                  {inputRefs(result.input, 'sourceResultIds').length > 0 && (
                    <p className="muted">
                      来源结果：
                      {inputRefs(result.input, 'sourceResultIds')
                        .map(short)
                        .join('、')}
                    </p>
                  )}
                  {result.activities.map((a) => (
                    <details key={a.id}>
                      <summary>
                        {a.toolName} · {statusNames[a.status]}
                      </summary>
                      {a.args && <Value value={a.args} />}{' '}
                      {a.result && <Value value={a.result} />}{' '}
                      {a.error && <p className="error-text">{a.error}</p>}
                    </details>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {selectedResults.length > 0 && (
        <div className="selection-bar">
          <span>跨运行已选 {selectedResults.length} 条结果</span>
          <Button
            onClick={() =>
              void onAction('keepResults', { resultIds: selectedResults })
            }
          >
            保留所选结果
          </Button>
          <Button variant="primary" onClick={onContinue}>
            用所选结果续做
            <ArrowRight size={15} />
          </Button>
          <Button variant="ghost" onClick={() => onSelectResults([])}>
            清除
          </Button>
        </div>
      )}
    </div>
  );
}
