import { ContentVisibility } from '../../components/ContentVisibility';
import type { RunFocus } from '../results/run-inspector-model';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, FileCheck2, Plus } from 'lucide-react';
import type {
  WorkItemPage,
  WorkItemSummaryPage,
  WorkItemView,
  WorkPage,
  WorkSummary,
} from '../../../shared/records';
import { api, apiIfChanged } from '../../core/api';
import { dateTime, errorText } from '../../core/format';
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
  TableRow,
  TableHeader,
  TableHead,
} from '../../components/ui/table';
import {
  ListToolbar,
  ListPagination,
  ListLoading,
} from '../../components/Management';
import { CreateItemDialog } from './WorkItemDialogs';
import { WorkItemDetail, type ItemDetailState } from './WorkItemDetail';
import type { ItemWorkspace } from '../../../shared/workitem-composition';
import type { WorkspaceSeed } from './composition/useCompositionWorkspace';
import './WorkItems.css';
import './WorkHome.css';
import type { ItemTab } from '../../app/navigation';
import { WorkItemStart } from './WorkItemStart';
import { ObjectLink } from '../../components/ObjectLink';
import { routeHref } from '../../app/navigation';
import { WorkspaceHeading } from '../../components/WorkspaceFrame';

import { itemStatusLabel, itemStatusFilterNames } from './item-status';
export { itemStatusNames } from './item-status';
export function WorkItems({
  active = true,
  mode = 'home',
  itemId,
  itemTab,
  onOpenItem,
  onItemTab,
  onAllItems,
  onRun,
  onMethod,
}: {
  active?: boolean;
  mode?: 'home' | 'list';
  itemId?: string;
  itemTab?: ItemTab;
  onOpenItem: (id: string, tab?: ItemTab) => void;
  onItemTab: (tab: ItemTab) => void;
  onAllItems: () => void;
  onRun: (ref: RunFocus) => void;
  onMethod: (id: string, authorText?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState('');
  const [data, setData] = useState<WorkItemSummaryPage>();
  const detailStates = useRef(new Map<string, ItemDetailState>());
  const listScroll = useRef({ home: 0, list: 0 });
  const showHome = mode === 'home';
  const filter = showHome
    ? (['', 'pending', 1, 5] as const)
    : ([query, status, page, pageSize] as const);
  const filterKey = JSON.stringify([mode, ...filter]);
  const [item, setItem] = useState<WorkItemView>();
  const [retainedItems, setRetainedItems] = useState<
    Record<string, WorkItemView>
  >({});
  const retained = useRef(retainedItems);
  retained.current = retainedItems;
  const workspaceSeeds = useRef(new Map<string, WorkspaceSeed>());
  useEffect(() => {
    // The detail now owns its snapshot; do not retain the initial large payload twice.
    for (const id of Object.keys(retainedItems))
      workspaceSeeds.current.delete(id);
  }, [retainedItems]);
  useEffect(() => {
    if (item)
      setRetainedItems((previous) =>
        previous[item.id] && previous[item.id].revision > item.revision
          ? previous
          : { ...previous, [item.id]: item },
      );
  }, [item]);
  const [methods, setMethods] = useState<WorkSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [startError, setStartError] = useState<{
    itemId: string;
    message: string;
  }>();
  const [methodsError, setMethodsError] = useState('');
  const [loading, setLoading] = useState(true);
  const lastFilter = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!active) return;
    let live = true;
    const controller = new AbortController();
    setLoading(true);
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const [next, selected] = await Promise.all([
          !itemId
            ? api<WorkItemSummaryPage>(
                `/api/items?${new URLSearchParams({ query: filter[0], status: filter[1], summary: 'true', view: 'roots', page: String(filter[2]), pageSize: String(filter[3]) })}`,
              )
            : Promise.resolve(undefined),
          itemId && !retained.current[itemId]
            ? apiIfChanged<ItemWorkspace>(
                `/api/items/${itemId}/workspace`,
                undefined,
                controller.signal,
              )
            : Promise.resolve(undefined),
        ]);
        if (live) {
          const replace = lastFilter.current !== filterKey;
          lastFilter.current = filterKey;
          if (next)
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
          if (selected?.data) {
            workspaceSeeds.current.set(selected.data.item.id, {
              value: selected.data,
              etag: selected.etag,
            });
            setItem(selected.data.item);
          }
          setError('');
        }
      } catch (reason) {
        if (live) setError(errorText(reason));
      } finally {
        if (live) {
          setLoading(false);
          if (!itemId || !retained.current[itemId])
            timer = setTimeout(() => void refresh(), 2000);
        }
      }
    }
    void refresh();
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [filterKey, itemId, active]);
  useEffect(() => {
    if (!active) return;
    void api<WorkPage>('/api/works?pageSize=100')
      .then((page) => {
        setMethods(page.works);
        setMethodsError('');
      })
      .catch((reason) => setMethodsError(errorText(reason)));
  }, [creating, active]);
  function openItem(id: string) {
    const list = document.querySelector('.work-items-scroll');
    if (!itemId && list) listScroll.current[mode] = list.scrollTop;
    const location = detailStates.current.get(id)?.tab as ItemTab | undefined;
    onOpenItem(id, location);
  }
  useEffect(() => {
    if (!active || itemId || loading || lastFilter.current !== filterKey)
      return;
    const el = document.querySelector('.work-items-scroll');
    if (el) el.scrollTop = listScroll.current[mode];
  }, [active, itemId, loading, mode, filterKey]);
  function startPlanning(next: WorkItemView) {
    setStartError(undefined);
    setItem(next);
    onOpenItem(next.id);
    void api(`/api/items/${next.id}/workspace/actions`, {
      action: 'assistant',
      text: '根据当前工作目标与已提供材料，先整理可追踪的输入集合，查找并读取已有方法合同，保存可执行处理流程，同时安排让用户看见当前业务阶段、已得内容、缺口与下一步的真实数据界面，按本项需要组织字段、统计、详情、补充及后续动作；有子项时才展示子项。先保存计划，不正式运行；不要用静态技术说明替代业务界面。',
    }).catch((reason) =>
      setStartError({ itemId: next.id, message: errorText(reason) }),
    );
  }
  function select(next: WorkItemView) {
    setRetainedItems((previous) => {
      const saved = previous[next.id];
      return saved && saved.revision > next.revision
        ? previous
        : { ...previous, [next.id]: next };
    });
    setItem((previous) =>
      previous?.id !== next.id || previous.revision > next.revision
        ? previous
        : next,
    );
  }
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil((data?.total ?? 0) / pageSize)),
  );
  const previousFilter = !!data && lastFilter.current !== filterKey;
  return (
    <section
      className={`items-page ${itemId ? 'item-detail-page' : 'work-home'}`}
      aria-label="工作台"
    >
      {error && (
        <div role="alert" className="error-banner">
          读取失败：{error}
          {data && ' · 当前保留上次读取的内容，将自动重试。'}
        </div>
      )}
      {startError?.itemId === itemId && startError && (
        <div role="alert" className="error-banner">
          规划未启动：{startError.message}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => item && startPlanning(item)}
          >
            重试规划
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStartError(undefined)}
          >
            关闭提示
          </Button>
        </div>
      )}
      {methodsError && (
        <div role="alert" className="error-banner">
          处理方法读取失败：{methodsError}
        </div>
      )}
      {Object.values(retainedItems)
        .filter((retained) => active && retained.id === itemId)
        .map((retained) => (
          <div
            key={retained.id}
            className="retained-item-detail"
            hidden={!itemId || retained.id !== itemId}
          >
            <ContentVisibility active={active && itemId === retained.id}>
              <WorkItemDetail
                initialWorkspace={workspaceSeeds.current.get(retained.id)}
                active={active && itemId === retained.id}
                item={retained}
                tabLocation={itemId === retained.id ? itemTab : undefined}
                onTabLocation={onItemTab}
                methods={methods}
                onChange={select}
                onOpen={openItem}
                state={detailStates.current.get(retained.id)}
                onState={(state) =>
                  detailStates.current.set(retained.id, state)
                }
                onRun={onRun}
                onMethod={onMethod}
              />
            </ContentVisibility>
          </div>
        ))}
      {itemId && !retainedItems[itemId] && (
        <Empty title={loading ? '正在载入工作项' : '无法打开工作项'}>
          {!loading && (
            <Button variant="outline" onClick={onAllItems}>
              工作项列表
            </Button>
          )}
        </Empty>
      )}
      {!itemId && (
        <>
          <WorkspaceHeading
            title={showHome ? '首页' : '工作项'}
            status={
              !showHome && data ? (
                <span className="management-count">{data.total}</span>
              ) : undefined
            }
            actions={
              !showHome && (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus size={14} />
                  新建工作项
                </Button>
              )
            }
          />
          <div
            className={
              showHome
                ? 'work-home-content work-items-scroll'
                : 'management-content work-items-scroll'
            }
            onScroll={(event) => {
              if (!loading && !previousFilter)
                listScroll.current[mode] = event.currentTarget.scrollTop;
            }}
          >
            {showHome && (
              <WorkItemStart
                onCreated={startPlanning}
                onAdvanced={() => setCreating(true)}
              />
            )}
            {showHome && (
              <div className="work-home-section">
                <h2>最近处理</h2>
                <Button size="sm" variant="ghost" onClick={onAllItems}>
                  全部工作项
                  <ChevronRight size={14} />
                </Button>
              </div>
            )}
            {!showHome && (
              <>
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
                  {(searchText || query) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSearchText('');
                        setQuery('');
                        setPage(1);
                      }}
                    >
                      清除搜索
                    </Button>
                  )}
                  <NativeSelect
                    layout="fit"
                    size="sm"
                    aria-label="工作项状态"
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value);
                      setPage(1);
                    }}
                  >
                    <NativeSelectOption value="">
                      全部状态 · {data?.summary.total ?? '—'}
                    </NativeSelectOption>
                    <NativeSelectOption value="pending">
                      未完成 · {data?.summary.pending ?? '—'}
                    </NativeSelectOption>
                    {Object.entries(itemStatusFilterNames).map(
                      ([key, name]) => (
                        <NativeSelectOption key={key} value={key}>
                          {name} ·{' '}
                          {data?.summary[
                            key as keyof WorkItemPage['summary']
                          ] ?? '—'}
                        </NativeSelectOption>
                      ),
                    )}
                  </NativeSelect>
                </ListToolbar>
              </>
            )}
            {data && !loading && previousFilter && (
              <p className="meta-text">
                当前筛选尚未读取成功，保留上次读取的 {data.total} 项。
              </p>
            )}
            {loading ? (
              <ListLoading />
            ) : !data ? (
              <Empty title="暂时无法读取工作项" />
            ) : !data.items.length ? (
              <Empty
                title={
                  previousFilter
                    ? '上次读取没有工作项，当前筛选尚未读取成功'
                    : !showHome && (query || status)
                      ? '没有符合条件的工作项'
                      : showHome
                        ? '暂无待继续的工作'
                        : '还没有工作项'
                }
              >
                {showHome && (
                  <span className="meta-text">从上方描述一件事开始。</span>
                )}
              </Empty>
            ) : (
              <div className={showHome ? undefined : 'management-table-wrap'}>
                <Table
                  className={
                    showHome
                      ? 'work-home-table'
                      : 'management-table work-home-table work-items-list-table'
                  }
                  aria-label="已有工作项"
                >
                  {!showHome && (
                    <TableHeader>
                      <TableRow>
                        <TableHead />
                        <TableHead>工作项</TableHead>
                        <TableHead>编号</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">最近进展</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                  )}
                  <TableBody>
                    {data.items.map((row) => (
                      <TableRow key={row.id} data-item-id={row.id}>
                        <TableCell className="work-home-icon">
                          <FileCheck2 size={19} />
                        </TableCell>
                        <TableCell>
                          <ObjectLink
                            className="work-home-title no-underline"
                            href={routeHref({ kind: 'item', id: row.id })}
                            onNavigate={() => openItem(row.id)}
                            title={row.title}
                            aria-label={`打开工作项 ${row.key}`}
                          >
                            <strong>{row.title}</strong>
                            <span>
                              {row.summary || row.blocker || row.goal}
                            </span>
                          </ObjectLink>
                        </TableCell>
                        {!showHome && (
                          <TableCell className="work-list-key">
                            {row.key}
                          </TableCell>
                        )}
                        <TableCell className="work-home-status">
                          <Badge status={row.effectiveStatus}>
                            {itemStatusLabel(row)}
                          </Badge>
                          {row.childCount > 0 && (
                            <span
                              className="work-home-child-count"
                              title={`直属子项已完成 ${row.completedChildCount} 项，共 ${row.childCount} 项`}
                            >
                              子项 {row.completedChildCount}/{row.childCount}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="work-home-date">
                          {dateTime(row.progressAt)}
                        </TableCell>
                        <TableCell className="work-home-chevron">
                          <ChevronRight size={14} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {!showHome &&
              data &&
              (data.total > pageSize || currentPage > 1) && (
                <ListPagination
                  page={currentPage}
                  pageSize={pageSize}
                  total={data?.total ?? 0}
                  loading={loading}
                  onPage={setPage}
                  onPageSize={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              )}
          </div>
        </>
      )}
      <CreateItemDialog
        open={creating}
        onOpenChange={setCreating}
        methods={methods}
        onCreated={(next) => {
          setItem(next);
          onOpenItem(next.id);
        }}
      />
    </section>
  );
}
