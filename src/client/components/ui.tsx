import { useContentVisibility } from './ContentVisibility';
import {
  ListChecks,
  CircleCheck,
  CircleX,
  CircleStop,
  CirclePause,
  CircleAlert,
  CircleDashed,
  Clock3,
  LoaderCircle,
  Square,
  FilePenLine,
  CheckCheck,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTaskDialogFocus } from './useTaskDialogFocus';
import { statusNames } from '../core/format';
import { Badge as PrimitiveBadge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

const statusIcons: Record<string, LucideIcon> = {
  review: ListChecks,
  queued: Clock3,
  running: LoaderCircle,
  stopping: Square,
  completed: CircleCheck,
  failed: CircleX,
  cancelled: CircleStop,
  interrupted: CirclePause,
  blocked: CircleAlert,
  waiting: Clock3,
  attention: CircleAlert,
  open: CircleDashed,
  empty: CircleDashed,
  draft: FilePenLine,
  adopted: CheckCheck,
  changed: FilePenLine,
  candidate: FilePenLine,
};
export function Badge({
  status,
  children,
  iconOnly = false,
}: {
  status?: string;
  children?: ReactNode;
  iconOnly?: boolean;
}) {
  const Icon = statusIcons[status || ''];
  const label = children || statusNames[status || ''];
  const progressOnly =
    typeof label === 'string' && /^\d+\s*\/\s*\d+/.test(label);
  const statusText = statusNames[status || ''] || label;
  if (Icon)
    return (
      <span
        className={`status-label relative ${status}`}
        title={
          progressOnly
            ? `${statusText} · ${label}`
            : typeof label === 'string'
              ? label
              : undefined
        }
      >
        <Icon
          size={14}
          aria-hidden="true"
          className={status === 'running' ? 'spin' : undefined}
        />
        {progressOnly && <span className="sr-only">{statusText} </span>}
        <span className={iconOnly ? 'sr-only' : undefined}>{label}</span>
      </span>
    );
  return (
    <PrimitiveBadge variant="ghost" className="badge">
      {label}
    </PrimitiveBadge>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  className,
  onCloseAutoFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  className?: string;
  onCloseAutoFocus?: (event: Event) => void;
  children: ReactNode;
}) {
  const visible = useContentVisibility();
  const focus = useTaskDialogFocus(onCloseAutoFocus);
  return (
    <Dialog open={open && visible} onOpenChange={onOpenChange}>
      <DialogContent
        layout="application"
        {...focus}
        aria-label={title}
        aria-labelledby={undefined}
        className={['modal', className].filter(Boolean).join(' ')}
      >
        <DialogHeader>
          <DialogTitle className="text-[length:var(--text-heading)] font-medium">
            {title}
          </DialogTitle>
          <DialogDescription className={description ? 'meta-text' : 'sr-only'}>
            {description || title}
          </DialogDescription>
        </DialogHeader>
        <div className="modal-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
