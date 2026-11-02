import type { ComponentProps } from 'react';

/** Object navigation stays a real link, including modified clicks and new tabs. */
export function ObjectLink({
  onNavigate,
  children,
  ...props
}: Omit<ComponentProps<'a'>, 'onClick'> & { onNavigate: () => void }) {
  return (
    <a
      {...props}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        onNavigate();
      }}
    >
      {children}
    </a>
  );
}
