import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type {
  ItemRunRef,
  WorkItemPage,
  WorkItemView,
  WorkPage,
  WorkSummary,
} from '../../../shared/records';
import { api } from '../../core/api';
import { dateTime, errorText, statusNames } from '../../core/format';
import { Badge, Empty } from '../../components/ui';
import { Button } from '../../components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '../../components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  PageHeader,
  ListToolbar,
  ListPagination,
  ListLoading,
} from '../../components/Management';
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
export function WorkItems({
  onRun,
  onMethod,
}: {
  onRun: (ref: ItemRunRef) => void;
  onMethod: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState('');
  const [data, setData] = useState<WorkItemPage>();
  const [itemId, setItemId] = useState<string>();
  const [item, setItem] = useState<WorkItemView>();
  const [methods, setMethods] = useState<WorkSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    let first = true;
    let timer: ReturnType<typeof setTimeout>;
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
          const replace = first;
          first = false;
          setData((previous) => {
            if (replace || !previous) return next;
            const byId = new Map(next.items.map((row) => [row.id, row]));
            // Refresh values in place; append newly observed items without moving the row being read.
            const existing = previous.items.flatMap((row) => {
              const updated = byId.get(row.id);
              byId.delete(row.id);
              return updated ? [updated] : [];
            });
            return { ...next, items: [...existing, ...byId.values()] };
          });
          setItem(selected);
          setError('');
        }
      } catch (reason) {
        if (live) setError(errorText(reason));
      } finally {
        if (live) timer = setTimeout(() => void refresh(), 2000);
      }
    }
    void refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, status, itemId]);
  useEffect(() => {
    void api<WorkPage>('/api/works?pageSize=100')
      .then((page) => setMethods(page.works))
      .catch((reason) => setError(errorText(reason)));
  }, [creating]);
  function select(next: WorkItemView) {
    setItem(next);
    setItemId(next.id);
  }
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil((data?.total ?? 0) / pageSize)),
  );
  return (
    <section className="management-page items-page" aria-label="工作项管理">
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
          <PageHeader title="工作项" count={data?.total}>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus />
              新建工作项
            </Button>
          </PageHeader>
          <ListToolbar
            label="搜索工作项"
            placeholder="搜索编号、标题或目标"
            value={searchText}
            onChange={setSearchText}
            onSearch={() => {
              setQuery(searchText.trim());
              setPage(1);
            }}
          >
            <NativeSelect
              size="sm"
              aria-label="工作项状态"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <NativeSelectOption value="">全部状态</NativeSelectOption>
              {Object.entries(itemStatusNames).map(([key, name]) => (
                <NativeSelectOption key={key} value={key}>
                  {name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </ListToolbar>
          {!data ? (
            <ListLoading />
          ) : !data.items.length ? (
            <Empty
              title={query || status ? '没有符合条件的工作项' : '还没有工作项'}
            >
              {!query && !status && (
                <Button variant="outline" onClick={() => setCreating(true)}>
                  新建工作项
                </Button>
              )}
            </Empty>
          ) : (
            <div className="management-table-wrap">
              <Table className="management-table items-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>名称 / 编号</TableHead>
                    <TableHead>业务进展</TableHead>
                    <TableHead>执行 / 等待</TableHead>
                    <TableHead>最近进展</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items
                    .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                    .map((row) => {
                      const wait = row.execution?.waits.find(
                        (value) => value.status === 'pending',
                      );
                      const stage =
                        row.stage &&
                        row.stage !== itemStatusNames[row.effectiveStatus]
                          ? row.stage
                          : undefined;
                      const summary =
                        row.effectiveStatus !== 'completed'
                          ? row.summary
                          : undefined;
                      const attention =
                        row.execution &&
                        ['failed', 'interrupted'].includes(
                          row.execution.status,
                        );
                      return (
                        <TableRow key={row.id} data-item-id={row.id}>
                          <TableCell>
                            <button
                              className="management-title-button"
                              onClick={() => select(row)}
                              title={row.title}
                              aria-label={`打开工作项 ${row.key}`}
                            >
                              <strong>{row.title}</strong>
                              <span className="management-secondary">
                                {row.key}
                              </span>
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="item-progress-line">
                              {(row.effectiveStatus !== 'open' || !stage) && (
                                <Badge status={row.effectiveStatus}>
                                  {itemStatusNames[row.effectiveStatus]}
                                </Badge>
                              )}
                              {stage && (
                                <span className="item-stage" title={stage}>
                                  {stage}
                                </span>
                              )}
                            </div>
                            {summary && (
                              <p
                                className="management-secondary"
                                title={summary}
                              >
                                {summary}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`item-execution ${attention ? 'attention' : ''}`}
                              title={wait?.reason}
                            >
                              {wait?.reason ||
                                (row.execution
                                  ? statusNames[row.execution.status] ||
                                    row.execution.status
                                  : '尚未执行')}
                            </span>
                            {wait && (
                              <span className="management-secondary">
                                {wait.dueAt
                                  ? `到期 ${dateTime(wait.dueAt)}`
                                  : `事件 ${wait.event}`}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="management-date">
                            {dateTime(row.progressAt)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}
          <ListPagination
            page={currentPage}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onPage={setPage}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
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
