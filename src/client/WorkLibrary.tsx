import { useEffect, useState, type FormEvent } from 'react';
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Pencil,
  Plus,
  Workflow,
} from 'lucide-react';
import type { WorkPage, WorkSummary } from '../shared/records';
import { api } from './model';
import { Empty, Modal } from './components/ui';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Input } from './components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './components/ui/table';
import {
  PageHeader,
  ListToolbar,
  ListPagination,
  ListLoading,
} from './components/Management';
import './WorkLibrary.css';

export default function WorkLibrary({
  onOpen,
  onCreate,
  onChanged,
  refreshKey = 0,
}: {
  onOpen: (id: string) => void;
  onCreate: () => void;
  onChanged?: () => void;
  refreshKey?: number;
}) {
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [archived, setArchived] = useState(false);
  const [data, setData] = useState<WorkPage>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [renaming, setRenaming] = useState<WorkSummary>();
  const [title, setTitle] = useState('');
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    const parameters = new URLSearchParams({
      query,
      page: String(page),
      pageSize: String(pageSize),
      archived: String(archived),
    });
    void api<WorkPage>(`/api/works?${parameters}`)
      .then((next) => {
        if (current) setData(next);
      })
      .catch((reason) => {
        if (current) {
          setData(undefined);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [query, page, pageSize, archived, revision, refreshKey]);

  async function action(id: string, fields: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/works/${id}/actions`, fields);
      setRevision((value) => value + 1);
      onChanged?.();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function rename(event: FormEvent) {
    event.preventDefault();
    if (renaming && (await action(renaming.id, { action: 'rename', title })))
      setRenaming(undefined);
  }
  const currentPage = data?.page ?? 1;
  return (
    <section className="management-page work-library" aria-label="流水线管理">
      <PageHeader title="流水线" count={data?.total}>
        <Button size="sm" onClick={onCreate}>
          <Plus />
          新建流水线
        </Button>
      </PageHeader>
      <Tabs
        className="library-body"
        value={archived ? 'archived' : 'active'}
        onValueChange={(value) => {
          setArchived(value === 'archived');
          setPage(1);
        }}
      >
        <ListToolbar
          label="搜索标题或目标"
          placeholder="搜索流水线"
          value={searchText}
          onChange={setSearchText}
          onSearch={() => {
            setPage(1);
            setQuery(searchText.trim());
          }}
        >
          <TabsList aria-label="流水线归档状态">
            <TabsTrigger value="active">未归档</TabsTrigger>
            <TabsTrigger value="archived">已归档</TabsTrigger>
          </TabsList>
        </ListToolbar>
        {error && (
          <div className="library-error" role="alert">
            <span>{error}</span>
            {!renaming && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRevision((value) => value + 1)}
              >
                重试
              </Button>
            )}
          </div>
        )}
        <TabsContent
          value={archived ? 'archived' : 'active'}
          className="library-content"
          aria-busy={loading}
        >
          {loading ? (
            <ListLoading />
          ) : !data?.works.length ? (
            <Empty
              title={
                query
                  ? '没有匹配的流水线'
                  : archived
                    ? '还没有归档的流水线'
                    : '还没有流水线'
              }
            >
              {!query && !archived && (
                <Button variant="outline" onClick={onCreate}>
                  新建流水线
                </Button>
              )}
            </Empty>
          ) : (
            <div className="management-table-wrap">
              <Table className="management-table library-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>定义状态</TableHead>
                    <TableHead>{archived ? '归档时间' : '最近修改'}</TableHead>
                    <TableHead>
                      <span className="sr-only">操作</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.works.map((work) => {
                    const name = work.title || work.goal;
                    const state = work.definitionState || 'empty';
                    return (
                      <TableRow key={work.id} className="library-item">
                        <TableCell>
                          <div className="management-row-title">
                            <Workflow size={18} />
                            <button
                              className="management-title-button"
                              aria-label={name}
                              onClick={() => onOpen(work.id)}
                              title={name}
                            >
                              <h2>{name}</h2>
                              <span className="management-secondary">
                                {work.nodeCount
                                  ? `${work.nodeCount} 个节点`
                                  : '尚未编排节点'}
                              </span>
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`definition-state definition-${state}`}
                          >
                            {
                              {
                                empty: '未定义',
                                draft: '草稿',
                                adopted: '已采用',
                                changed: '有新草稿',
                              }[state]
                            }
                          </Badge>
                        </TableCell>
                        <TableCell className="management-date">
                          {new Date(
                            (archived ? work.archivedAt : undefined) ||
                              work.updatedAt,
                          ).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`更多操作 ${name}`}
                                disabled={busy}
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() => {
                                  setRenaming(work);
                                  setTitle(name);
                                  setError('');
                                }}
                              >
                                <Pencil />
                                重命名
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() =>
                                  void action(work.id, {
                                    action: 'archive',
                                    archived: !archived,
                                  })
                                }
                              >
                                {archived ? <ArchiveRestore /> : <Archive />}
                                {archived ? '恢复' : '归档'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
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
      <Modal
        open={Boolean(renaming)}
        onOpenChange={(open) => {
          if (!open) setRenaming(undefined);
        }}
        title="重命名流水线"
      >
        <form
          className="library-rename"
          onSubmit={(event) => void rename(event)}
        >
          <label className="field">
            流水线标题
            <Input
              autoFocus
              required
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="library-rename-actions">
            <Button
              variant="outline"
              type="button"
              onClick={() => setRenaming(undefined)}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy || !title.trim()}>
              {busy ? '正在保存…' : '保存标题'}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
