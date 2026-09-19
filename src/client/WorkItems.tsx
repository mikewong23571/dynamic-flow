import { useEffect, useState } from 'react';
import { ArrowRight, Plus, Search } from 'lucide-react';
import type {
  ItemRunRef,
  WorkItemPage,
  WorkItemView,
  WorkPage,
  WorkSummary,
} from '../shared/records';
import { api } from './model';
import { Badge, Button, Empty } from './components/ui';
import { CreateItemDialog } from './WorkItemDialogs';
import { WorkItemDetail } from './WorkItemDetail';
import './WorkItems.css';

export const itemStatusNames = {
  open: '待推进',
  running: '推进中',
  waiting: '等待中',
  attention: '需处理',
  completed: '已结项',
};
export const itemTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
export function WorkItems({
  onRun,
  onMethod,
}: {
  onRun: (ref: ItemRunRef) => void;
  onMethod: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState<WorkItemPage>();
  const [itemId, setItemId] = useState<string>();
  const [item, setItem] = useState<WorkItemView>();
  const [methods, setMethods] = useState<WorkSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    async function refresh() {
      try {
        const [next, selected] = await Promise.all([
          api<WorkItemPage>(
            `/api/items?${new URLSearchParams({ query, status })}`,
          ),
          itemId
            ? api<WorkItemView>(`/api/items/${itemId}`)
            : Promise.resolve(undefined),
        ]);
        if (live) {
          setData(next);
          setItem(selected);
          setError('');
        }
      } catch (reason) {
        if (live) setError(String(reason));
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [query, status, itemId]);
  useEffect(() => {
    void api<WorkPage>('/api/works?pageSize=100')
      .then((page) => setMethods(page.works))
      .catch((reason) => setError(String(reason)));
  }, [creating]);
  function select(next: WorkItemView) {
    setItem(next);
    setItemId(next.id);
  }
  return (
    <section className="items-page" aria-label="工作项管理">
      {error && (
        <div role="alert" className="error-banner">
          {error}
        </div>
      )}
      {itemId ? (
        item?.id === itemId ? (
          <WorkItemDetail
            item={item}
            methods={methods}
            onChange={select}
            onBack={() => {
              setItemId(undefined);
              setItem(undefined);
            }}
            onRun={onRun}
            onMethod={onMethod}
          />
        ) : (
          <Empty title="正在载入工作项" />
        )
      ) : (
        <>
          <header className="items-heading">
            <div>
              <span className="eyebrow">业务进展</span>
              <h1>工作项</h1>
            </div>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={15} />
              新建工作项
            </Button>
          </header>
          <div className="items-filters">
            <label className="items-search">
              <Search size={16} />
              <input
                aria-label="搜索工作项"
                placeholder="搜索编号、标题或目标"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="工作项状态"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">全部状态</option>
              {Object.entries(itemStatusNames).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
            <span className="muted">{data?.total ?? 0} 项</span>
          </div>
          {!data ? (
            <Empty title="正在载入" />
          ) : !data.items.length ? (
            <Empty
              title={query || status ? '没有符合条件的工作项' : '还没有工作项'}
            >
              <Button onClick={() => setCreating(true)}>
                登记一件需要持续推进的工作
              </Button>
            </Empty>
          ) : (
            <div className="items-table-wrap">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>工作项</th>
                    <th>业务进展</th>
                    <th>执行 / 等待</th>
                    <th>最近进展</th>
                    <th>
                      <span className="sr-only">打开</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => {
                    const wait = row.execution?.waits.find(
                      (w) => w.status === 'pending',
                    );
                    return (
                      <tr key={row.id}>
                        <td>
                          <button
                            className="item-title-button"
                            onClick={() => select(row)}
                          >
                            <small>{row.key}</small>
                            <strong>{row.title}</strong>
                            <small className="item-narrow-date">
                              进展 {itemTime(row.progressAt)}
                            </small>
                          </button>
                        </td>
                        <td>
                          <Badge status={row.effectiveStatus}>
                            {itemStatusNames[row.effectiveStatus]}
                          </Badge>
                          <strong className="item-stage">
                            {row.stage || '尚未开始'}
                          </strong>
                          <p className="item-cell-summary">
                            {row.summary || '尚无业务进展'}
                          </p>
                        </td>
                        <td>
                          <span>
                            {wait?.reason ||
                              (row.execution
                                ? executionName(row.execution.status)
                                : '未运行')}
                          </span>
                          {wait && (
                            <small className="item-next">
                              {wait.dueAt
                                ? `到期 ${itemTime(wait.dueAt)}`
                                : `等待事件 ${wait.event}`}
                            </small>
                          )}
                        </td>
                        <td className="item-date">
                          {itemTime(row.progressAt)}
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            aria-label={`打开工作项 ${row.key}`}
                            onClick={() => select(row)}
                          >
                            <ArrowRight size={16} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <CreateItemDialog
        open={creating}
        onOpenChange={setCreating}
        methods={methods}
        onCreated={select}
      />
    </section>
  );
}
export function executionName(status: string) {
  return (
    (
      {
        queued: '排队中',
        running: '执行中',
        waiting: '持久等待',
        stopping: '正在停止',
        completed: '执行完成',
        failed: '执行失败',
        interrupted: '执行中断',
        cancelled: '已停止',
      } as Record<string, string>
    )[status] || status
  );
}
