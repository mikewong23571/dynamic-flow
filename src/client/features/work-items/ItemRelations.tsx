import { useEffect, useState, useRef } from 'react';
import type {
  WorkItemSummaryPage,
  WorkItemSummary,
  WorkItemView,
  WorkSummary,
} from '../../../shared/records';
import { api } from '../../core/api';
import { errorText } from '../../core/format';
import { Badge, Empty } from '../../components/ui';
import { Button } from '../../components/ui/button';
import { GitBranch, MoreHorizontal, Plus, Search } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { NativeSelect } from '../../components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { ListToolbar, ListPagination } from '../../components/Management';
import { CreateItemDialog } from './WorkItemDialogs';
import { BatchItemRun, type BatchRow } from './BatchItemRun';
import { ItemBatchProgress } from './ItemBatchProgress';
import { DeferredDetails } from '../../components/DeferredContent';
import { itemStatusLabel, itemStatusNames } from './item-status';

export type RelationLocation = {
  selected?: string[];
  batchRows?: BatchRow[];
  view: string;
  query: string;
  page: number;
  pageSize: number;
  todo: string;
  status?: string;
};
export function ItemRelations({
  item,
  methods,
  active,
  location,
  onLocation,
  onOpen,
  onChanged,
  onCounts,
  onSummarize,
}: {
  item: WorkItemView;
  methods: WorkSummary[];
  active: boolean;
  location: RelationLocation;
  onLocation: (next: RelationLocation) => void;
  onOpen: (id: string) => void;
  onChanged: () => void;
  onCounts: (summary: WorkItemSummary) => void;
  onSummarize: (source: 'stage' | 'completion') => void;
}) {
  const lastQuery = useRef('');
  const [data, setData] = useState<WorkItemSummaryPage>();
  const [search, setSearch] = useState(location.query);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [batch, setBatch] = useState(false);
  const selected = location.selected || [];
  function setSelected(value: string[] | ((ids: string[]) => string[])) {
    onLocation({
      ...location,
      selected: typeof value === 'function' ? value(selected) : value,
    });
  }
  const queryKey = JSON.stringify([
    location.view,
    location.query,
    location.page,
    location.pageSize,
    location.todo,
    location.status,
  ]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const params = new URLSearchParams({
          summary: 'true',
          rootId: item.id,
          view: location.view,
          query: location.query,
          page: String(location.page),
          pageSize: String(location.pageSize),
          todo: location.todo,
          status: location.status || '',
        });
        const next = await api<WorkItemSummaryPage>(`/api/items?${params}`);
        if (live) {
          if (location.view === 'children') onCounts(next.scopeSummary);
          const queryIdentity = JSON.stringify([queryKey, revision]);
          const replace = lastQuery.current !== queryIdentity;
          lastQuery.current = queryIdentity;
          setData((previous) => {
            if (replace || !previous) return next;
            const byId = new Map(next.items.map((row) => [row.id, row]));
            const existing = previous.items.flatMap((row) => {
              const updated = byId.get(row.id);
              byId.delete(row.id);
              return updated ? [updated] : [];
            });
            return { ...next, items: [...existing, ...byId.values()] };
          });
          setError('');
        }
      } catch (e) {
        if (live) setError(errorText(e));
      }
      if (live) timer = setTimeout(refresh, 2000);
    }
    void refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [active, item.id, item.revision, queryKey, revision]);
  function update(patch: Partial<RelationLocation>) {
    onLocation({ ...location, ...patch, selected: [] });
  }
  const filtering = !!(
    location.query ||
    location.status ||
    location.todo ||
    location.view !== 'children'
  );
  const empty = !!data && !data.scopeSummary.total && !filtering;
  const showFilters = searchOpen || filtering;
  return (
    <section className="item-section item-relations" aria-label="子项与待办">
      {data && !empty && (
        <div className="children-task-toolbar">
          <span className="meta-text">{data.total} 项</span>
          <div className="inline-group">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreating(true)}
            >
              <Plus size={14} />
              添加子项
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="子项更多操作"
                >
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setSearchOpen(!searchOpen)}>
                  <Search size={14} />
                  搜索与筛选
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSelecting(!selecting)}>
                  选择多个事项
                </DropdownMenuItem>
                {!!data.scopeSummary.total && (
                  <DropdownMenuItem onSelect={() => onSummarize('stage')}>
                    使用子项成果继续处理
                  </DropdownMenuItem>
                )}
                {!!data.scopeSummary.completed && (
                  <DropdownMenuItem onSelect={() => onSummarize('completion')}>
                    使用已确认完成依据
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
      {showFilters && (
        <>
          <ListToolbar
            label="搜索范围内工作项"
            placeholder="搜索问题、范围或编号"
            value={search}
            onChange={setSearch}
            onSearch={() => update({ query: search.trim(), page: 1 })}
          >
            <div
              className="item-relations-filters"
              role="group"
              aria-label="子项筛选"
            >
              <NativeSelect
                layout="fit"
                size="sm"
                className="min-w-32"
                aria-label="子项视图"
                value={location.view}
                onChange={(e) =>
                  update({
                    view: e.target.value,
                    page: 1,
                    status: '',
                    todo: '',
                  })
                }
              >
                <option value="children">直属子项</option>
                <option value="todo">范围内待办</option>
                <option value="all">范围内全部</option>
                <option value="excluded">已排除</option>
              </NativeSelect>
              {location.view === 'children' && (
                <NativeSelect
                  size="sm"
                  aria-label="子项状态"
                  value={location.status || ''}
                  onChange={(e) => update({ status: e.target.value, page: 1 })}
                >
                  <option value="">全部状态</option>
                  <option value="pending">未结项</option>
                  {Object.entries(itemStatusNames).map(([status, label]) => (
                    <option key={status} value={status}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              )}
              {location.view === 'todo' && (
                <NativeSelect
                  layout="fit"
                  size="sm"
                  className="min-w-32"
                  aria-label="待办类型"
                  value={location.todo}
                  onChange={(e) => update({ todo: e.target.value, page: 1 })}
                >
                  <option value="">全部待办</option>
                  <option value="blocked">需补材料</option>
                  <option value="review">待复核</option>
                  <option value="confirm">待整体确认</option>
                  <option value="process">待处理</option>
                  <option value="running">推进中</option>
                  <option value="waiting">等待中</option>
                </NativeSelect>
              )}
            </div>
          </ListToolbar>
        </>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <ItemBatchProgress itemId={item.id} active={active} />
      {!!selected.length && (
        <div className="materials-toolbar">
          <span>已选 {selected.length} 项</span>
          <Button onClick={() => setBatch(true)}>批量处理</Button>
        </div>
      )}
      {data?.items.length ? (
        <Table className="management-table">
          <TableHeader>
            <TableRow>
              {selecting && (
                <TableHead className="w-10">
                  <input
                    aria-label="选择本页子项"
                    type="checkbox"
                    checked={data.items.every((r) => selected.includes(r.id))}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? data.items.map((r) => r.id) : [],
                      )
                    }
                  />
                </TableHead>
              )}
              <TableHead>事项</TableHead>
              <TableHead>进展</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((row) => (
              <TableRow key={row.id} data-child-id={row.id}>
                {selecting && (
                  <TableCell>
                    <input
                      aria-label={`选择 ${row.title}`}
                      type="checkbox"
                      checked={selected.includes(row.id)}
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked
                            ? [...ids, row.id]
                            : ids.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </TableCell>
                )}
                <TableCell>
                  <button
                    className="management-title-button"
                    onClick={() => onOpen(row.id)}
                  >
                    <strong>{row.title}</strong>
                    <span className="management-secondary">
                      {row.parentTitle && row.parentId !== item.id
                        ? row.parentTitle
                        : row.goal}
                    </span>
                  </button>
                  {row.status === 'completed' && (
                    <ConfirmedConclusion id={row.id} />
                  )}
                </TableCell>
                <TableCell>
                  <Badge status={row.effectiveStatus}>
                    {itemStatusLabel(row)}
                  </Badge>
                  {row.blocker && (
                    <div className="management-secondary">{row.blocker}</div>
                  )}
                  {row.childCount > 0 && (
                    <div className="management-secondary">
                      子项 {row.completedChildCount}/{row.childCount}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : !data ? (
        <Empty title={error ? '暂时无法读取子项' : '正在读取子项'} />
      ) : empty ? (
        <div className="children-empty">
          <GitBranch size={30} />
          <h3>尚未拆分独立事项</h3>
          <p>需要单独跟踪时，再建立子项。</p>
          <Button onClick={() => setCreating(true)}>
            <Plus size={14} />
            添加子项
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ view: 'excluded', page: 1 })}
          >
            查看已排除事项
          </Button>
        </div>
      ) : (
        <div className="children-no-match">
          <p>没有匹配的事项</p>
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              update({
                view: 'children',
                query: '',
                status: '',
                todo: '',
                page: 1,
              });
            }}
          >
            清除筛选
          </Button>
        </div>
      )}
      {data && (data.total > location.pageSize || location.page > 1) && (
        <ListPagination
          page={location.page}
          pageSize={location.pageSize}
          total={data.total}
          loading={false}
          onPage={(page) => update({ page })}
          onPageSize={(pageSize) => update({ pageSize, page: 1 })}
        />
      )}
      <CreateItemDialog
        parent={item}
        open={creating}
        onOpenChange={setCreating}
        methods={methods}
        onCreated={() => {
          setRevision((n) => n + 1);
          onChanged();
        }}
      />
      {batch && (
        <BatchItemRun
          ids={selected}
          parentId={item.id}
          savedRows={location.batchRows}
          onRows={(rows) => onLocation({ ...location, batchRows: rows })}
          methods={methods}
          onOpen={onOpen}
          onClose={() => {
            setBatch(false);
            setRevision((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}

function ConfirmedConclusion({ id }: { id: string }) {
  const [item, setItem] = useState<WorkItemView>();
  const [error, setError] = useState('');
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open && !item)
          void api<WorkItemView>(`/api/items/${id}`)
            .then(setItem)
            .catch((e) => setError(errorText(e)));
      }}
    >
      <summary>已确认结论</summary>
      {error && <p role="alert">{error}</p>}
      {item?.criteria.map((c) => (
        <div key={c.id}>
          <strong>{c.text}</strong>
          <p className="whitespace-pre-wrap">{c.evidence}</p>
        </div>
      ))}
      {item && !item.criteria.length && <span>范围内子项结论已确认</span>}
    </details>
  );
}
