import { useEffect, useState, type FormEvent } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Pencil,
  Plus,
  Search,
} from 'lucide-react';
import type { WorkPage, WorkSummary } from '../shared/records';
import { api } from './model';
import { Button, Empty, Modal } from './components/ui';
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
  function search(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(searchText.trim());
  }
  async function rename(event: FormEvent) {
    event.preventDefault();
    if (renaming && (await action(renaming.id, { action: 'rename', title })))
      setRenaming(undefined);
  }
  const currentPage = data?.page ?? 1;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  return (
    <section className="work-library" aria-label="工作列表">
      <header className="library-heading">
        <div>
          <span className="eyebrow">工作空间</span>
          <h1>所有工作</h1>
        </div>
        <Button variant="primary" onClick={onCreate}>
          <Plus size={16} />
          新建工作
        </Button>
      </header>
      <div className="library-controls">
        <div className="library-tabs" role="tablist" aria-label="工作状态">
          <button
            role="tab"
            aria-selected={!archived}
            onClick={() => {
              setArchived(false);
              setPage(1);
            }}
          >
            进行中
          </button>
          <button
            role="tab"
            aria-selected={archived}
            onClick={() => {
              setArchived(true);
              setPage(1);
            }}
          >
            已归档
          </button>
        </div>
        <form className="library-search" onSubmit={search}>
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="搜索标题或目标"
            placeholder="搜索标题或目标"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Button type="submit" disabled={loading}>
            搜索
          </Button>
        </form>
      </div>
      {error && (
        <div className="library-error" role="alert">
          <span>{error}</span>
          {!renaming && (
            <Button onClick={() => setRevision((value) => value + 1)}>
              重试
            </Button>
          )}
        </div>
      )}
      <div className="library-list" aria-busy={loading}>
        {loading ? (
          <p className="library-loading" role="status">
            正在加载工作…
          </p>
        ) : !data?.works.length ? (
          <Empty
            title={
              query
                ? '没有找到匹配的工作'
                : archived
                  ? '还没有归档的工作'
                  : '开始一项新工作'
            }
          >
            {!query && !archived && (
              <Button onClick={onCreate}>
                <Plus size={16} />
                新建工作
              </Button>
            )}
          </Empty>
        ) : (
          data.works.map((work) => {
            const name = work.title || work.goal;
            return (
              <article key={work.id} className="library-item">
                <div className="library-work-icon">
                  <FolderOpen size={21} />
                </div>
                <div className="library-work-content">
                  <button
                    className="library-work-title"
                    onClick={() => onOpen(work.id)}
                    title={name}
                  >
                    <h2>{name}</h2>
                    <ArrowRight size={16} />
                  </button>
                  <p className="library-work-goal" title={work.goal}>
                    {work.goal}
                  </p>
                  <span className="library-work-date">
                    {archived ? '归档于' : '更新于'}{' '}
                    {new Date(
                      (archived ? work.archivedAt : undefined) ||
                        work.updatedAt,
                    ).toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="library-item-actions">
                  <Button
                    variant="ghost"
                    aria-label={`重命名 ${name}`}
                    disabled={busy}
                    onClick={() => {
                      setRenaming(work);
                      setTitle(name);
                      setError('');
                    }}
                  >
                    <Pencil size={15} />
                    重命名
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`${archived ? '恢复' : '归档'} ${name}`}
                    disabled={busy}
                    onClick={() =>
                      void action(work.id, {
                        action: 'archive',
                        archived: !archived,
                      })
                    }
                  >
                    {archived ? (
                      <ArchiveRestore size={15} />
                    ) : (
                      <Archive size={15} />
                    )}
                    {archived ? '恢复' : '归档'}
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
      <footer className="library-pagination">
        <span>{loading ? '加载中' : `共 ${data?.total ?? 0} 项工作`}</span>
        <label>
          每页
          <select
            aria-label="每页工作数"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
          >
            <option value={10}>10 项</option>
            <option value={20}>20 项</option>
            <option value={50}>50 项</option>
          </select>
        </label>
        <div className="library-page-buttons">
          <Button
            aria-label="上一页"
            disabled={loading || currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <span>
            第 {currentPage} / {pages} 页
          </span>
          <Button
            aria-label="下一页"
            disabled={loading || currentPage >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </footer>
      <Modal
        open={Boolean(renaming)}
        onOpenChange={(open) => {
          if (!open) setRenaming(undefined);
        }}
        title="重命名工作"
      >
        <form
          className="library-rename"
          onSubmit={(event) => void rename(event)}
        >
          <label className="field">
            工作标题
            <input
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
            <Button type="button" onClick={() => setRenaming(undefined)}>
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !title.trim()}
            >
              {busy ? '正在保存…' : '保存标题'}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
