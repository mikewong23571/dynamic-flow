import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  Play,
  Plus,
  Square,
  Check,
  RotateCcw,
} from 'lucide-react';
import type {
  CompletionCriterion,
  ItemRunRef,
  WorkItemView,
  WorkSummary,
} from '../shared/records';
import { api, short, splitMaterials, workTitle } from './model';
import { Badge, Button, Modal } from './components/ui';
import { executionName, itemStatusNames, itemTime } from './WorkItems';

export function WorkItemDetail({
  item,
  methods,
  onChange,
  onBack,
  onRun,
  onMethod,
}: {
  item: WorkItemView;
  methods: WorkSummary[];
  onChange: (item: WorkItemView) => void;
  onBack: () => void;
  onRun: (ref: ItemRunRef) => void;
  onMethod: (id: string) => void;
}) {
  const [criteria, setCriteria] = useState<CompletionCriterion[]>(
    item.criteria,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<
    'evidence' | 'signal' | 'method' | 'reopen' | null
  >(null);
  const [text, setText] = useState('');
  const [methodId, setMethodId] = useState(item.workflowId);
  const [eventName, setEventName] = useState('');
  const [eventId, setEventId] = useState('');
  const criteriaKey = JSON.stringify(item.criteria);
  useEffect(() => {
    setCriteria(item.criteria);
  }, [item.id, criteriaKey]);
  const execution = item.execution;
  const unresolved =
    !!execution &&
    ['queued', 'running', 'waiting', 'interrupted', 'stopping'].includes(
      execution.status,
    );
  const waiting =
    execution?.waits.filter((wait) => wait.status === 'pending') || [];
  const completed = item.status === 'completed';
  const changedCriteria = JSON.stringify(criteria) !== criteriaKey;
  async function action(name: string, fields: Record<string, unknown> = {}) {
    setBusy(true);
    setError('');
    try {
      const next = await api<WorkItemView>(`/api/items/${item.id}/actions`, {
        action: name,
        ...fields,
      });
      onChange(next);
      return true;
    } catch (reason) {
      setError(String(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function openDialog(next: typeof dialog) {
    setText('');
    setError('');
    setMethodId(item.workflowId);
    setEventName(waiting[0]?.event || '');
    setEventId(crypto.randomUUID());
    setDialog(next);
  }
  async function submitDialog() {
    let ok = false;
    if (dialog === 'evidence')
      ok = await action('addEvidence', { materials: splitMaterials(text) });
    if (dialog === 'method')
      ok = await action('method', { workflowId: methodId });
    if (dialog === 'reopen') ok = await action('reopen', { reason: text });
    if (dialog === 'signal') {
      try {
        const payload = text.trim() ? JSON.parse(text) : undefined;
        ok = await action('signal', {
          id: eventId,
          name: eventName,
          ...(payload !== undefined ? { payload } : {}),
        });
      } catch {
        setError('事件内容不是有效的 JSON。');
      }
    }
    if (ok) setDialog(null);
  }
  return (
    <article className="item-detail" aria-label="工作项详情">
      <header className="items-heading">
        <div>
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft size={14} />
            工作项
          </Button>
          <div className="item-heading-line">
            <span className="item-key">{item.key}</span>
            <Badge status={item.effectiveStatus}>
              {itemStatusNames[item.effectiveStatus]}
            </Badge>
          </div>
          <h1>{item.title}</h1>
        </div>
        <div className="inline-group">
          {completed ? (
            <Button onClick={() => openDialog('reopen')}>
              <RotateCcw size={14} />
              重新打开
            </Button>
          ) : (
            <>
              <Button
                disabled={
                  busy ||
                  unresolved ||
                  changedCriteria ||
                  !criteria.length ||
                  criteria.some((c) => !c.met || !c.evidence.trim())
                }
                onClick={() => void action('complete')}
              >
                <Check size={14} />
                结项
              </Button>
              {unresolved ? (
                <>
                  {execution?.status === 'interrupted' && (
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() => void action('resume')}
                    >
                      继续执行
                    </Button>
                  )}
                  <Button
                    disabled={busy || execution?.status === 'stopping'}
                    onClick={() => void action('stop')}
                  >
                    <Square size={13} />
                    停止执行
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void action('run')}
                >
                  <Play size={14} />
                  推进工作项
                </Button>
              )}
            </>
          )}
        </div>
      </header>
      {error && !dialog && (
        <div role="alert" className="error-banner">
          {error}
        </div>
      )}
      <div className="item-body">
        <div className="item-main-column">
          <section className="item-section">
            <h2>当前进展</h2>
            <p className="item-goal">{item.goal}</p>
            <div className="item-progress">
              <strong>{item.stage || '尚未开始'}</strong>
              <p>{item.summary || '尚无已确认的业务进展'}</p>
              <small>最近业务进展 · {itemTime(item.progressAt)}</small>
            </div>
            {waiting.map((wait) => (
              <div className="item-wait" key={wait.nodeId}>
                <Clock3 size={17} />
                <div>
                  <strong>{wait.reason}</strong>
                  <p>
                    事件：{wait.event}
                    {wait.dueAt ? ` · 或到期 ${itemTime(wait.dueAt)}` : ''}
                  </p>
                </div>
              </div>
            ))}
            {waiting.length > 0 && (
              <Button onClick={() => openDialog('signal')} disabled={busy}>
                发送事件
              </Button>
            )}
          </section>
          <section className="item-section">
            <div className="section-heading">
              <h2>完成条件</h2>
              <span className="muted">
                {item.criteria.filter((c) => c.met).length} /{' '}
                {item.criteria.length}
              </span>
            </div>
            <div className="item-criteria">
              {criteria.map((criterion, index) => (
                <div key={criterion.id}>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={criterion.met}
                      disabled={completed || busy}
                      onChange={(e) =>
                        setCriteria(
                          criteria.map((c, i) =>
                            i === index ? { ...c, met: e.target.checked } : c,
                          ),
                        )
                      }
                    />
                    {criterion.text}
                  </label>
                  <textarea
                    aria-label={`依据：${criterion.text}`}
                    placeholder="满足条件的依据与证据引用"
                    rows={2}
                    value={criterion.evidence}
                    disabled={completed || busy}
                    onChange={(e) =>
                      setCriteria(
                        criteria.map((c, i) =>
                          i === index ? { ...c, evidence: e.target.value } : c,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            {!completed && (
              <Button
                disabled={busy || !changedCriteria}
                onClick={() => void action('criteria', { criteria })}
              >
                保存完成条件
              </Button>
            )}
          </section>
          <section className="item-section">
            <div className="section-heading">
              <h2>
                证据材料 <span className="muted">{item.materials.length}</span>
              </h2>
              <Button
                onClick={() => openDialog('evidence')}
                disabled={completed || busy}
              >
                <Plus size={14} />
                补充证据
              </Button>
            </div>
            <div className="item-evidence">
              {item.materials.map((material) => (
                <details key={material.id}>
                  <summary>
                    <code>{material.id}</code>
                    <span>{material.text.split('\n')[0]}</span>
                  </summary>
                  <p>{material.text}</p>
                </details>
              ))}
              {!item.materials.length && <p className="muted">暂无材料</p>}
            </div>
          </section>
          <section className="item-section">
            <h2>业务历史</h2>
            <ol className="item-history">
              {[...item.history].reverse().map((entry) => (
                <li key={entry.id}>
                  <span className="history-point" />
                  <div>
                    <p>{entry.summary}</p>
                    <small>
                      {itemTime(entry.at)}
                      {entry.materialIds?.length
                        ? ` · 证据 ${entry.materialIds.join('、')}`
                        : ''}
                    </small>
                    {!!entry.criteria?.length && (
                      <details className="item-history-criteria">
                        <summary>当时的完成条件与依据</summary>
                        {entry.criteria.map((criterion) => (
                          <div key={criterion.id}>
                            <strong>
                              {criterion.met ? '已满足' : '未满足'} ·{' '}
                              {criterion.text}
                            </strong>
                            <p>{criterion.evidence || '尚无依据'}</p>
                          </div>
                        ))}
                      </details>
                    )}
                    {entry.source && (
                      <Button
                        variant="ghost"
                        onClick={() => onRun(entry.source!)}
                      >
                        查看来源运行 <ArrowUpRight size={13} />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="item-side-column">
          <section className="item-section">
            <h2>处理方法</h2>
            <button
              className="item-method-link"
              onClick={() => onMethod(item.workflowId)}
            >
              {methods.find((m) => m.id === item.workflowId)
                ? workTitle(methods.find((m) => m.id === item.workflowId)!)
                : short(item.workflowId)}
              <ArrowUpRight size={14} />
            </button>
            <Button
              variant="ghost"
              disabled={unresolved || completed || busy}
              onClick={() => openDialog('method')}
            >
              更换处理方法
            </Button>
          </section>
          <section className="item-section">
            <h2>当前执行</h2>
            <Badge status={execution?.status}>
              {execution ? executionName(execution.status) : '未运行'}
            </Badge>
            {execution && (
              <>
                <dl className="item-metadata">
                  <dt>固定版本</dt>
                  <dd>{short(execution.definitionId)}</dd>
                  <dt>输入快照</dt>
                  <dd>修订 {execution.inputRevision ?? '—'}</dd>
                </dl>
                <Button onClick={() => onRun(execution)}>
                  查看运行详情 <ArrowUpRight size={14} />
                </Button>
                {execution.error && (
                  <p className="inline-error">{execution.error}</p>
                )}
              </>
            )}
          </section>
          <section className="item-section">
            <h2>
              运行记录 <span className="muted">{item.runs.length}</span>
            </h2>
            <div className="item-run-list">
              {[...item.runs].reverse().map((ref) => (
                <button key={ref.runId} onClick={() => onRun(ref)}>
                  <span>{short(ref.runId)}</span>
                  <small>版本 {short(ref.definitionId)}</small>
                  <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <Modal
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={
          dialog === 'evidence'
            ? '补充证据'
            : dialog === 'signal'
              ? '发送事件'
              : dialog === 'method'
                ? '更换处理方法'
                : '重新打开工作项'
        }
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void submitDialog();
          }}
        >
          {dialog === 'method' ? (
            <label className="field">
              处理方法
              <select
                value={methodId}
                onChange={(e) => setMethodId(e.target.value)}
              >
                {methods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {workTitle(method)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              {dialog === 'signal' && (
                <>
                  <label className="field">
                    事件名称
                    <input
                      required
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    事件 ID
                    <input
                      required
                      value={eventId}
                      onChange={(e) => setEventId(e.target.value)}
                    />
                  </label>
                </>
              )}
              <label className="field">
                {dialog === 'signal'
                  ? '事件内容（JSON，可选）'
                  : dialog === 'evidence'
                    ? '证据材料（每行一条）'
                    : '重开原因'}
                <textarea
                  rows={5}
                  required={dialog !== 'signal'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
            </>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button type="button" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button variant="primary" disabled={busy}>
              {dialog === 'signal'
                ? '发送事件'
                : dialog === 'evidence'
                  ? '添加证据'
                  : dialog === 'method'
                    ? '确认更换'
                    : '确认重开'}
            </Button>
          </div>
        </form>
      </Modal>
    </article>
  );
}
