import { itemStatusLabel } from '../work-items/item-status';
import { useMemo, useState } from 'react';
import type { Run } from '../../../shared/records';
import { Badge } from '../../components/ui';
import { Button } from '../../components/ui/button';
import { Button as ObjectButton } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/native-select';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '../../components/ui/table';
import { ListPagination } from '../../components/Management';
import { dateTime, statusNames } from '../../core/format';
import {
  runLabel,
  artifactGroups,
  type RunRow,
  type FinalArtifact,
} from './result-overview-model';
export type OverviewMode = 'runs' | 'artifacts';
export function ResultsOverview({
  rows,
  artifacts,
  mode,
  onMode,
  loading,
  error,
  onRetry,
  onProcess,
  onRunArtifacts,
  onArtifact,
}: {
  rows: RunRow[];
  artifacts: FinalArtifact[];
  mode: OverviewMode;
  onMode: (mode: OverviewMode) => void;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onProcess: (run: Run) => void;
  onRunArtifacts: (run: Run) => void;
  onArtifact: (artifact: FinalArtifact, origin: OverviewMode) => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('time');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const runs = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            `${row.relatedTitle || ''} ${row.key || ''} ${runLabel(row.run, row.item)}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            (status === 'all' || row.run.status === status),
        )
        .sort((left, right) =>
          sort === 'title'
            ? (left.relatedTitle || '').localeCompare(right.relatedTitle || '')
            : sort === 'status'
              ? left.run.status.localeCompare(right.run.status)
              : right.run.startedAt.localeCompare(left.run.startedAt),
        ),
    [rows, query, status, sort],
  );
  const groups = useMemo(() => artifactGroups(artifacts), [artifacts]);
  const outputs = useMemo(
    () =>
      groups
        .filter(
          (entry) =>
            `${entry.title} ${entry.source} ${entry.step}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            (status === 'all' || status === 'completed'),
        )
        .sort((left, right) =>
          sort === 'title'
            ? left.title.localeCompare(right.title)
            : sort === 'source'
              ? left.source.localeCompare(right.source)
              : right.run.startedAt.localeCompare(left.run.startedAt),
        ),
    [groups, query, status, sort],
  );
  const total = mode === 'runs' ? runs.length : outputs.length;
  const current = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  return (
    <section className="results-overview" aria-label="流水线运行结果总览">
      <div className="results-overview-tools">
        <div className="inline-group" aria-label="结果视图">
          <Button
            size="sm"
            variant={mode === 'runs' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'runs'}
            onClick={() => {
              onMode('runs');
              if (sort === 'source') setSort('time');
              setPage(1);
            }}
          >
            运行记录
          </Button>
          <Button
            size="sm"
            variant={mode === 'artifacts' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'artifacts'}
            onClick={() => {
              onMode('artifacts');
              setPage(1);
            }}
          >
            仅看成果
          </Button>
        </div>
        <Input
          aria-label="搜索运行结果"
          placeholder={
            mode === 'runs' ? '搜索关联工作项或执行' : '搜索成果、步骤或来源'
          }
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
        <NativeSelect
          aria-label="筛选结果状态"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">全部执行状态</option>
          {Object.entries(statusNames).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="排列运行结果"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="time">最近时间</option>
          <option value="title">
            {mode === 'runs' ? '关联工作项' : '成果名称'}
          </option>
          <option value="status">执行状态</option>
          {mode === 'artifacts' && <option value="source">来源</option>}
        </NativeSelect>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          业务状态读取失败：{error}{' '}
          <Button variant="outline" size="sm" onClick={onRetry}>
            重新读取
          </Button>
        </div>
      )}
      <div className="results-overview-table">
        <Table className="table-fixed">
          <colgroup>
            {(mode === 'runs' ? [22, 22, 12, 14, 30] : [36, 28, 18, 18]).map(
              (width, index) => (
                <col key={index} style={{ width: `${width}%` }} />
              ),
            )}
          </colgroup>
          {mode === 'runs' ? (
            <>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3 text-left">执行</TableHead>
                  <TableHead className="px-3 text-left">关联工作项</TableHead>
                  <TableHead className="px-3 text-left">执行状态</TableHead>
                  <TableHead className="px-3 text-left">成果</TableHead>
                  <TableHead className="px-3 text-left">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs
                  .slice((current - 1) * pageSize, current * pageSize)
                  .map(({ run, item, relatedTitle, key }) => (
                    <TableRow key={run.id} data-run-id={run.id}>
                      <TableCell className="px-3 py-3 text-left align-top whitespace-normal">
                        <strong className="block py-1.5 leading-5">
                          {runLabel(run, item)}
                        </strong>
                        <small>
                          {run.scope === 'full'
                            ? '完整流程'
                            : run.effectMode === 'commit'
                              ? '单步骤正式处理'
                              : '单步骤试运行'}{' '}
                          · {dateTime(run.startedAt)}
                        </small>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-left align-top whitespace-normal">
                        {relatedTitle ? (
                          <>
                            <strong className="block py-1.5 leading-5">
                              {relatedTitle}
                            </strong>
                            <small>{key}</small>
                            <span className="meta-text">
                              业务：
                              {item ? (
                                <Badge status={item.effectiveStatus}>
                                  {itemStatusLabel(item)}
                                </Badge>
                              ) : loading ? (
                                '读取中'
                              ) : (
                                '状态不可用'
                              )}
                            </span>
                          </>
                        ) : (
                          <span className="meta-text block py-1.5 leading-5">
                            无关联工作项
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-left align-top whitespace-normal">
                        <div className="flex min-h-8 items-center">
                          <Badge status={run.status} />
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-left align-top whitespace-normal">
                        <span className="block py-1.5 leading-5">
                          {
                            artifacts.filter((entry) => entry.run.id === run.id)
                              .length
                          }{' '}
                          份成果
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-left align-top whitespace-normal">
                        <div className="run-result-actions">
                          <ObjectButton
                            className="justify-start text-left"
                            variant="outline"
                            size="sm"
                            onClick={() => onRunArtifacts(run)}
                          >
                            查看成果
                          </ObjectButton>
                          <ObjectButton
                            className="justify-start text-left"
                            variant="ghost"
                            size="sm"
                            onClick={() => onProcess(run)}
                          >
                            查看过程
                          </ObjectButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </>
          ) : (
            <>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3 text-left">成果</TableHead>
                  <TableHead className="px-3 text-left">关联工作项</TableHead>
                  <TableHead className="px-3 text-left">时间</TableHead>
                  <TableHead className="px-3 text-left">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outputs
                  .slice((current - 1) * pageSize, current * pageSize)
                  .map((entry) => (
                    <TableRow key={entry.id} data-artifact-group-id={entry.id}>
                      <TableCell className="px-3 py-3 text-left align-top whitespace-normal">
                        <strong>{entry.title}</strong>
                        <small>{entry.items.length} 份成果</small>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-left align-top whitespace-normal">
                        {entry.source}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-left align-top whitespace-normal">
                        {dateTime(entry.run.startedAt)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-left align-top">
                        <ObjectButton
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            onArtifact(entry.items[0], 'artifacts')
                          }
                        >
                          查看成果
                        </ObjectButton>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </>
          )}
        </Table>
        {!total && (
          <p className="meta-text results-empty">
            {rows.length ? '没有匹配结果' : '尚无运行记录'}
          </p>
        )}
      </div>
      <ListPagination
        page={current}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        onPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </section>
  );
}
