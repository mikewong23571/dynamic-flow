import type { FormEvent, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { NativeSelect, NativeSelectOption } from './ui/native-select';
import { Pagination, PaginationContent, PaginationItem } from './ui/pagination';
import { Skeleton } from './ui/skeleton';
import './Management.css';

export function PageHeader({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <header className="management-heading">
      <div className="management-title">
        <h1>{title}</h1>
        {count !== undefined && (
          <span className="management-count">{count}</span>
        )}
      </div>
      {children}
    </header>
  );
}
export function ListToolbar({
  label,
  placeholder,
  value,
  onChange,
  onSearch,
  children,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  children?: ReactNode;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch();
  }
  return (
    <div className="management-toolbar">
      <form className="management-search" onSubmit={submit}>
        <div className="management-search-field">
          <Search size={15} aria-hidden="true" />
          <Input
            aria-label={label}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        <Button size="sm" variant="outline" type="submit">
          搜索
        </Button>
      </form>
      {children}
    </div>
  );
}
export function ListPagination({
  page,
  pageSize,
  total,
  loading,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <footer className="management-pagination">
      <span>共 {total} 项</span>
      <label>
        每页
        <NativeSelect
          size="sm"
          aria-label="每页条目数"
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
        >
          {[10, 20, 50].map((size) => (
            <NativeSelectOption key={size} value={size}>
              {size} 项
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <Pagination aria-label="列表分页">
        <PaginationContent>
          <PaginationItem>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="上一页"
              disabled={loading || page <= 1}
              onClick={() => onPage(page - 1)}
            >
              <ChevronLeft />
            </Button>
          </PaginationItem>
          <PaginationItem className="management-page-number">
            第 {page} / {pages} 页
          </PaginationItem>
          <PaginationItem>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="下一页"
              disabled={loading || page >= pages}
              onClick={() => onPage(page + 1)}
            >
              <ChevronRight />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </footer>
  );
}
export function ListLoading() {
  return (
    <div className="management-loading" role="status" aria-label="正在载入">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
