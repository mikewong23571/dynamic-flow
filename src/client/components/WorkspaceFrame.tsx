import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TabsList, TabsTrigger } from './ui/tabs';
import { cn } from '../lib/utils';
import './WorkspaceFrame.css';

/** Preserve user panel preference while adapting its physical placement to the viewport. */
function useNarrowWorkspace() {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia('(max-width: 1279px)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1279px)');
    const update = () => setNarrow(query.matches);
    query.addEventListener('change', update);
    update();
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}

export function WorkspaceHeading({
  title,
  eyebrow,
  description,
  leading,
  context,
  status,
  actions,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  leading?: ReactNode;
  context?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-header">
      {leading}
      <div className="work-title">
        {(eyebrow || context) && (
          <div className="workspace-location">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {context}
          </div>
        )}
        <div className="workspace-title-row">
          <h1 title={description || title}>{title}</h1>
          {status}
        </div>
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}

export function WorkspaceNavigation({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="workspace-bar">
      {children}
      <div className="bar-actions">{actions}</div>
    </div>
  );
}

export function WorkspaceTabList({
  className,
  ...props
}: React.ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      {...props}
      variant="line"
      className={cn(
        'workspace-tabs-list w-auto justify-start gap-[18px] rounded-none p-0 group-data-[orientation=horizontal]/tabs:h-[46px] max-[1200px]:gap-[11px] max-[1050px]:gap-[5px]',
        className,
      )}
    />
  );
}

export function WorkspaceTab({
  className,
  ...props
}: React.ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      {...props}
      className={cn(
        'h-full flex-none rounded-none border-0 border-b-2 border-transparent px-[5px] py-0 text-xs font-normal text-muted-foreground after:hidden data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-medium dark:data-[state=active]:border-foreground dark:data-[state=active]:bg-transparent max-[1200px]:text-[11px] max-[1050px]:px-[3px]',
        className,
      )}
    />
  );
}

export function WorkspaceContent({
  children,
  panel,
  docked = false,
}: {
  children: ReactNode;
  panel?: ReactNode;
  docked?: boolean;
}) {
  const narrow = useNarrowWorkspace();
  return (
    <div
      className="workspace-content"
      data-panel-layout={docked || narrow ? 'dock' : 'side'}
    >
      <section className="main-content">{children}</section>
      {panel}
    </div>
  );
}

const WIDTH_KEY = 'dynamic-flow.panel-width';
const WIDTH_EVENT = 'flowcraft:panel-width';
const MIN_WIDTH = 260;
const maxWidth = () => Math.min(640, Math.round(window.innerWidth * 0.6));
const clampWidth = (value: number) =>
  Math.max(MIN_WIDTH, Math.min(maxWidth(), value));
function readWidth() {
  try {
    const value = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(value) && value >= MIN_WIDTH
      ? clampWidth(value)
      : null;
  } catch {
    return null;
  }
}

/** The same physical panel and width preference in both workspaces. */
export function WorkspaceSidePanel({
  children,
  mode = 'side',
  label,
}: {
  children: ReactNode;
  mode?: 'side' | 'dock';
  label?: string;
}) {
  const narrow = useNarrowWorkspace();
  const effectiveMode = narrow ? 'dock' : mode;
  const [width, setWidth] = useState<number | null>(readWidth);
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{
    x: number;
    width: number;
    current: number;
    userSelect: string;
    cursor: string;
  } | null>(null);
  const restorePointer = () => {
    const current = drag.current;
    if (!current) return;
    document.body.style.userSelect = current.userSelect;
    document.body.style.cursor = current.cursor;
    drag.current = null;
  };
  function remember(value: number) {
    const next = clampWidth(value);
    setWidth(next);
    try {
      localStorage.setItem(WIDTH_KEY, String(next));
    } catch {
      /* Keep this session usable. */
    }
    window.dispatchEvent(new Event(WIDTH_EVENT));
  }
  useEffect(() => {
    const refresh = () => setWidth(readWidth());
    window.addEventListener(WIDTH_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('resize', refresh);
    return () => {
      window.removeEventListener(WIDTH_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('resize', refresh);
      restorePointer();
    };
  }, []);
  return (
    <aside
      ref={panel}
      className="context-panel"
      data-mode={effectiveMode}
      aria-label={label}
      style={effectiveMode === 'side' && width ? { width } : undefined}
    >
      {effectiveMode === 'side' && (
        <div
          className="panel-resize-handle"
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="调整面板宽度"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={maxWidth()}
          aria-valuenow={width ?? undefined}
          title="拖拽调整宽度，双击恢复默认"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            const initial = panel.current!.getBoundingClientRect().width;
            drag.current = {
              x: event.clientX,
              width: initial,
              current: initial,
              userSelect: document.body.style.userSelect,
              cursor: document.body.style.cursor,
            };
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            drag.current.current = clampWidth(
              drag.current.width + drag.current.x - event.clientX,
            );
            setWidth(drag.current.current);
          }}
          onPointerUp={(event) => {
            if (drag.current) remember(drag.current.current);
            restorePointer();
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={restorePointer}
          onLostPointerCapture={restorePointer}
          onDoubleClick={() => {
            try {
              localStorage.removeItem(WIDTH_KEY);
            } catch {
              /* Use the responsive default. */
            }
            setWidth(null);
            window.dispatchEvent(new Event(WIDTH_EVENT));
          }}
          onKeyDown={(event) => {
            const current = panel.current!.getBoundingClientRect().width;
            const next =
              event.key === 'ArrowLeft'
                ? current + 16
                : event.key === 'ArrowRight'
                  ? current - 16
                  : event.key === 'Home'
                    ? MIN_WIDTH
                    : event.key === 'End'
                      ? maxWidth()
                      : undefined;
            if (next === undefined) return;
            event.preventDefault();
            remember(next);
          }}
        />
      )}
      {children}
    </aside>
  );
}
