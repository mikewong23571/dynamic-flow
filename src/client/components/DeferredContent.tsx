import { useState, type DetailsHTMLAttributes, type ReactNode } from 'react';
import { ContentVisibility } from './ContentVisibility';

/** Keep inspected state, without constructing content before its first visit. */
export function DeferredContent({
  active,
  children,
}: {
  active: boolean;
  children: () => ReactNode;
}) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return active || visited ? (
    <ContentVisibility active={active}>{children()}</ContentVisibility>
  ) : null;
}

export function DeferredDetails({
  summary,
  children,
  ...props
}: Omit<DetailsHTMLAttributes<HTMLDetailsElement>, 'children' | 'onToggle'> & {
  summary: ReactNode;
  children: () => ReactNode;
}) {
  const [visited, setVisited] = useState(false);
  return (
    <details
      {...props}
      onToggle={(event) => {
        if (event.currentTarget.open) setVisited(true);
      }}
    >
      <summary>{summary}</summary>
      {visited && children()}
    </details>
  );
}
