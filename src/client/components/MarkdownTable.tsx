import type { ReactNode } from 'react';
export function MarkdownTable({ children }: { children?: ReactNode }) {
  return (
    <div className="markdown-table-scroll">
      <table>{children}</table>
    </div>
  );
}
