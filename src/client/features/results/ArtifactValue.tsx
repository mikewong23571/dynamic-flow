import { RemoteContent } from './RemoteContent';
import { memo, useMemo, useState } from 'react';
import type { Json } from '../../../shared/records';
import { Value } from './Value';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { DeferredDetails } from '../../components/DeferredContent';
import './ArtifactValue.css';

export function valueSummary(value: Json): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `${value.length} 项`;
  if (typeof value === 'object') return `${Object.keys(value).length} 个字段`;
  return String(value);
}
const record = (value: Json): value is Record<string, Json> =>
  value !== null && !Array.isArray(value) && typeof value === 'object';

/** 按数据的实际结构提供检查操作，不解释业务字段或推断结论。 */
export const ArtifactValue = memo(function ArtifactValue({
  value,
  view,
  contentUrl,
}: {
  contentUrl?: string;
  value: Json;
  view?: 'content' | 'raw';
}) {
  const [raw, setRaw] = useState(false);
  if (contentUrl) return <RemoteContent key={contentUrl} url={contentUrl} />;
  return (
    <div className="artifact-value">
      {!view && (
        <div className="artifact-value-mode">
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={!raw}
            onClick={() => setRaw(false)}
          >
            查看内容
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={raw}
            onClick={() => setRaw(true)}
          >
            原始数据
          </Button>
        </div>
      )}
      {(view ? view === 'raw' : raw) ? (
        <pre className="artifact-raw">
          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
        </pre>
      ) : (
        <StructuredValue value={value} />
      )}
    </div>
  );
});
const StructuredValue = memo(function StructuredValue({
  value,
}: {
  value: Json;
}) {
  if (value === '') return <p className="meta-text">空文本</p>;
  if (record(value) && !Object.keys(value).length)
    return <p className="meta-text">空对象</p>;
  if (Array.isArray(value)) return <Collection value={value} />;
  if (record(value))
    return (
      <div className="artifact-fields">
        {Object.entries(value).map(([key, field]) =>
          (typeof field === 'object' && field !== null) ||
          (typeof field === 'string' && field.length > 300) ? (
            <DeferredDetails
              key={key}
              summary={
                <>
                  <strong>{key}</strong>{' '}
                  <span>
                    {typeof field === 'string'
                      ? `${field.length} 字符`
                      : valueSummary(field)}
                  </span>
                </>
              }
            >
              {() => <StructuredValue value={field} />}
            </DeferredDetails>
          ) : (
            <div className="artifact-field" key={key}>
              <span>{key}</span>
              <div>
                {typeof field === 'string' && /^https?:\/\/\S+$/.test(field) ? (
                  <a href={field} target="_blank" rel="noreferrer">
                    {field}
                  </a>
                ) : (
                  valueSummary(field)
                )}
              </div>
            </div>
          ),
        )}
      </div>
    );
  return (
    <div className="artifact-text">
      <Value value={value} />
    </div>
  );
});
function Collection({ value }: { value: Json[] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; descending: boolean }>();
  const [selected, setSelected] = useState<number>();
  const objects = value.length > 0 && value.every(record);
  const columns = useMemo(
    () =>
      objects
        ? [
            ...new Set(
              value.flatMap((row) => Object.keys(row as Record<string, Json>)),
            ),
          ]
        : ['内容'],
    [value, objects],
  );
  const rows = useMemo(() => {
    const needle = query.toLocaleLowerCase();
    const rows = value
      .map((row, index) => ({ row, index }))
      .filter(
        ({ row }) =>
          !needle || JSON.stringify(row).toLocaleLowerCase().includes(needle),
      );
    if (sort)
      rows.sort((a, b) => {
        const cell = (row: Json) =>
          objects ? (row as Record<string, Json>)[sort.key] : row;
        const av = cell(a.row),
          bv = cell(b.row);
        const order =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : (av === undefined ? '' : valueSummary(av)).localeCompare(
                bv === undefined ? '' : valueSummary(bv),
                'zh-CN',
                { numeric: true },
              );
        return (sort.descending ? -order : order) || a.index - b.index;
      });
    return rows;
  }, [value, query, sort, objects]);
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / pageSize) - 1),
  );
  return (
    <div className="artifact-collection">
      <div className="artifact-collection-tools">
        <Input
          aria-label="查找集合内容"
          placeholder="查找内容…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <span>
          {rows.length} / {value.length} 项
        </span>
        {selected !== undefined && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(undefined)}
          >
            关闭条目
          </Button>
        )}
      </div>
      {selected !== undefined && (
        <section
          className="artifact-row-detail"
          aria-label={`条目 ${selected + 1}`}
        >
          <h4>条目 {selected + 1}</h4>
          <StructuredValue value={value[selected]} />
        </section>
      )}
      <Table className="artifact-table">
        <TableHeader>
          <TableRow>
            <TableHead>条目</TableHead>
            {columns.map((key) => (
              <TableHead key={key}>
                <button
                  onClick={() =>
                    setSort({
                      key,
                      descending: sort?.key === key && !sort.descending,
                    })
                  }
                >
                  {key}
                  {sort?.key === key ? (sort.descending ? ' ↓' : ' ↑') : ''}
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows
            .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
            .map(({ row, index }) => (
              <TableRow
                key={index}
                data-state={selected === index ? 'selected' : undefined}
              >
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`打开条目 ${index + 1}`}
                    onClick={() => setSelected(index)}
                  >
                    {index + 1} ↗
                  </Button>
                </TableCell>
                {columns.map((key) => {
                  const cell = objects
                    ? (row as Record<string, Json>)[key]
                    : row;
                  return (
                    <TableCell key={key}>
                      <button
                        className="artifact-cell"
                        onClick={() => setSelected(index)}
                        title={
                          cell === undefined
                            ? '无此字段'
                            : valueSummary(cell).slice(0, 160)
                        }
                      >
                        {cell === undefined
                          ? '—'
                          : valueSummary(cell).slice(0, 160)}
                      </button>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
        </TableBody>
      </Table>
      {rows.length > pageSize && (
        <div className="artifact-collection-tools">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            上一页条目
          </Button>
          <span>
            {currentPage + 1} / {Math.ceil(rows.length / pageSize)} 页
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(currentPage + 1) * pageSize >= rows.length}
            onClick={() => setPage(currentPage + 1)}
          >
            下一页条目
          </Button>
        </div>
      )}
      {!rows.length && (
        <p className="meta-text">{value.length ? '没有匹配内容' : '空集合'}</p>
      )}
    </div>
  );
}

function flatten(
  value: Json,
  path: (string | number)[] = [],
  result: Record<string, { label: string; value: string }> = {},
) {
  if (value && typeof value === 'object' && Object.keys(value).length) {
    for (const [key, child] of Object.entries(value))
      flatten(
        child,
        [...path, Array.isArray(value) ? Number(key) : key],
        result,
      );
  } else
    result[JSON.stringify(path)] = {
      label:
        path
          .map((segment) =>
            typeof segment === 'number' ? `条目 ${segment + 1}` : segment,
          )
          .join(' › ') || '内容',
      value: JSON.stringify(value),
    };
  return result;
}
export function ArtifactComparison({
  left,
  right,
}: {
  left: { label: string; value: Json };
  right: { label: string; value: Json };
}) {
  const [onlyChanges, setOnlyChanges] = useState(true);
  const a = useMemo(() => flatten(left.value), [left.value]);
  const b = useMemo(() => flatten(right.value), [right.value]);
  const paths = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const changes = paths.filter((path) => a[path]?.value !== b[path]?.value);
  return (
    <section className="artifact-comparison" aria-label="成果字段比较">
      <div className="artifact-collection-tools">
        <strong>{changes.length} 处字段差异</strong>
        <label className="check-row">
          <input
            type="checkbox"
            checked={onlyChanges}
            onChange={(e) => setOnlyChanges(e.target.checked)}
          />
          只看差异
        </label>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead title="按字段路径对齐；数组按原位置对应">
              字段 / 位置
            </TableHead>
            <TableHead>{left.label}</TableHead>
            <TableHead>{right.label}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(onlyChanges ? changes : paths).map((path) => (
            <TableRow key={path}>
              <TableCell>
                <span>{a[path]?.label || b[path]?.label}</span>
              </TableCell>
              <TableCell>
                <ComparisonCell text={a[path]?.value} />
              </TableCell>
              <TableCell>
                <ComparisonCell text={b[path]?.value} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!changes.length && <p>内容相同</p>}
    </section>
  );
}
function ComparisonCell({ text }: { text?: string }) {
  return text === undefined ? (
    <span className="meta-text">无此字段</span>
  ) : (
    <details>
      <summary>{text.length > 100 ? `${text.slice(0, 100)}…` : text}</summary>
      <pre>{text}</pre>
    </details>
  );
}
