import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownTable } from './components/MarkdownTable';
import { Copy, ChevronRight, ArrowRight } from 'lucide-react';
import type {
  Definition,
  Inputs,
  Json,
  NodeResult,
  Work,
} from '../shared/records';
import { active, resultItems, short, statusNames, nodeTotal } from './model';
import { Badge, Button, Empty } from './components/ui';
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
                {item.materialIds.join(' · ') || item.sampleId}
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
  selectedDefinitionId,
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
  selectedDefinitionId?: string;
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
      </Empty>
    );
  const def = definitions[run.definitionId];
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
        {Object.entries(run.nodeStates).map(([id, state]) => (
          <div className="step-progress" key={id}>
            <span>{def?.nodes.find((n) => n.id === id)?.label || id}</span>
            <Badge status={state} />
            <span>
              {
                run.results.filter(
                  (r) => r.nodeId === id && r.status === 'completed',
                ).length
              }{' '}
              / {nodeTotal(run, id)} 个实例
            </span>
          </div>
        ))}
        {run.results.map((result) => {
          const final = Object.values(def?.outputs || {}).some(
            (v) => v[0] === result.nodeId,
          );
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
                    disabled={result.status !== 'completed'}
                    onChange={() => toggle(result.id)}
                  />
                  <strong>
                    {def?.nodes.find((n) => n.id === result.nodeId)?.label ||
                      result.nodeId}
                  </strong>
                </label>
                {final && <Badge>最终产物</Badge>}
                <Badge status={result.status} />
                <span className="muted">
                  {Object.values(result.input)
                    .flat()
                    .map((i) => i.materialIds.join(', '))
                    .join(' · ')}
                </span>
              </header>
              {result.error && <p className="inline-error">{result.error}</p>}
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
                <Button variant="ghost" onClick={() => onCandidate(result)}>
                  从此结果改进
                </Button>
                {result.status === 'failed' && (
                  <Button
                    onClick={() =>
                      void onAction('retry', {
                        runId: run.id,
                        resultIds: [result.id],
                        definitionId: selectedDefinitionId || run.definitionId,
                      })
                    }
                  >
                    用所选做法重试此输入
                  </Button>
                )}
                {result.status === 'completed' && (
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
                  {Object.values(result.input)
                    .flat()
                    .some((i) => i.sourceResultIds.length > 0) && (
                    <p className="muted">
                      来源结果：
                      {Object.values(result.input)
                        .flat()
                        .flatMap((i) => i.sourceResultIds)
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
