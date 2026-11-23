import type { DeliveryBrowserState } from './delivery-browser-state';
import { Fragment, useEffect, useState } from 'react';
import { useStateField } from '@openuidev/react-lang';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Search } from 'lucide-react';
import type { Json } from '../../../../shared/records';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { ListPagination } from '../../../components/Management';
type Column = { field: string; label: string };
export function atPath(value: Json, field: string): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value[field]
    : undefined;
}
const shortValue = (value: Json | undefined) =>
  value === undefined || value === null
    ? '—'
    : typeof value === 'boolean'
      ? value
        ? '是'
        : '否'
      : typeof value === 'object'
        ? Array.isArray(value)
          ? value.length <= 3 && value.every((item) => typeof item === 'string')
            ? value.join('、') || '—'
            : `${value.length} 项`
          : `${Object.keys(value).length} 个字段`
        : String(value);
export function RecordTable({
  rows,
  rowKey,
  columns,
  selection,
  groupBy,
  children,
  onInspect,
  onContinue,
  browserState,
  searchable = false,
}: {
  rows: Record<string, Json>[];
  rowKey: string;
  columns: Column[];
  selection?: unknown;
  searchable?: boolean;
  groupBy?: string;
  children?: ReactNode;
  onInspect: (value: Json) => void;
  onContinue?: (ids: string[]) => void;
  browserState?: DeliveryBrowserState;
}) {
  const field = useStateField<string[]>(
    `${rowKey}-selection`,
    selection as string[],
  );
  const selectable = selection != null;
  const selected = selectable ? field.value || [] : [];
  const setSelected = field.setValue;
  const [query, setQuery] = useState(browserState?.table?.query || '');
  const [order, setOrder] = useState<
    { field: string; desc: boolean } | undefined
  >(browserState?.table?.order);
  const [page, setPage] = useState(browserState?.table?.page || 1);
  const [pageSize, setPageSize] = useState(browserState?.table?.pageSize || 25);
  useEffect(() => {
    if (browserState) browserState.table = { query, order, page, pageSize };
  }, [browserState, query, order, page, pageSize]);
  const ids = rows.map((row) => atPath(row, rowKey));
  if (
    ids.some((id) => typeof id !== 'string' || !id) ||
    new Set(ids).size !== ids.length
  )
    return (
      <p role="alert" className="inline-error">
        成果记录缺少唯一标识，请检查本次交付。
      </p>
    );
  const filtered = rows.filter(
    (row) =>
      !searchable ||
      !query ||
      columns.some((column) =>
        shortValue(atPath(row, column.field))
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
      ),
  );
  if (order)
    filtered.sort(
      (a, b) =>
        shortValue(atPath(a, order.field)).localeCompare(
          shortValue(atPath(b, order.field)),
          undefined,
          { numeric: true },
        ) * (order.desc ? -1 : 1),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const displayed = groupBy
    ? [...filtered].sort((a, b) =>
        String(a[String(groupBy)]).localeCompare(String(b[String(groupBy)])),
      )
    : filtered;
  const visible = displayed.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const selectedSet = new Set(selected || []);
  const visibleIds = visible.map((row) => String(atPath(row, rowKey)));
  function toggle(ids: string[], checked: boolean) {
    setSelected(
      checked
        ? [...new Set([...(selected || []), ...ids])]
        : (selected || []).filter((id) => !ids.includes(id)),
    );
  }
  return (
    <section className="composition-records" aria-label="成果记录">
      {(searchable || selected.length > 0 || children) && (
        <div className="composition-table-tools">
          {searchable && (
            <label className="composition-search">
              <Search size={15} />
              <Input
                aria-label="搜索成果记录"
                placeholder="搜索记录"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </label>
          )}
          {searchable && (
            <span className="meta-text">
              {filtered.length} / {rows.length} 条
            </span>
          )}
          {!!selected?.length && (
            <>
              <strong>{selected.length} 条已选</strong>
              <Button variant="ghost" onClick={() => setSelected([])}>
                清除选择
              </Button>
              {!children && !!onContinue && (
                <Button
                  variant="default"
                  onClick={() => onContinue?.(selected)}
                >
                  用所选记录继续
                </Button>
              )}
            </>
          )}
          {children && <div className="table-business-actions">{children}</div>}
        </div>
      )}
      <div className="composition-table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="composition-check">
                  <input
                    type="checkbox"
                    aria-label="选择本页记录"
                    checked={
                      visibleIds.length > 0 &&
                      visibleIds.every((id) => selectedSet.has(id))
                    }
                    onChange={(event) =>
                      toggle(visibleIds, event.target.checked)
                    }
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead key={column.field}>
                  <button
                    className="composition-column-sort"
                    onClick={() =>
                      setOrder({
                        field: column.field,
                        desc:
                          order?.field === column.field ? !order.desc : false,
                      })
                    }
                  >
                    {column.label}
                    {order?.field === column.field &&
                      (order.desc ? (
                        <ArrowDown size={12} />
                      ) : (
                        <ArrowUp size={12} />
                      ))}
                  </button>
                </TableHead>
              ))}
              <TableHead>
                <span className="sr-only">详情</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row, index) => {
              const id = String(atPath(row, rowKey));
              return (
                <Fragment key={id}>
                  {!!groupBy &&
                    (index === 0 ||
                      String(visible[index - 1][String(groupBy)]) !==
                        String(row[String(groupBy)])) && (
                      <TableRow className="composition-record-group">
                        <TableCell
                          colSpan={columns.length + (selectable ? 2 : 1)}
                        >
                          {shortValue(row[String(groupBy)])}
                        </TableCell>
                      </TableRow>
                    )}
                  <TableRow data-selected={selectedSet.has(id)}>
                    {selectable && (
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`选择记录 ${id}`}
                          checked={selectedSet.has(id)}
                          onChange={(event) =>
                            toggle([id], event.target.checked)
                          }
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell key={column.field}>
                        <span title={shortValue(atPath(row, column.field))}>
                          {shortValue(atPath(row, column.field))}
                        </span>
                      </TableCell>
                    ))}
                    <TableCell>
                      <Button
                        variant="ghost"
                        aria-label={`查看记录 ${id}`}
                        onClick={() => onInspect(row)}
                      >
                        <ExternalLink size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {!filtered.length && (
        <div className="composition-empty">没有匹配的记录</div>
      )}
      {(filtered.length > pageSize || pageSize !== 25) && (
        <ListPagination
          page={currentPage}
          pageSize={pageSize}
          total={filtered.length}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </section>
  );
}
