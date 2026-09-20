import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { statusNames } from '../core/format';
import { Button as PrimitiveButton } from './ui/button';
import { Badge as PrimitiveBadge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

// Compatibility for existing workspace consumers; variants are owned by shadcn.
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  }
>(function Button({ variant = 'secondary', className = '', ...props }, ref) {
  const mapped = {
    primary: 'default',
    secondary: 'outline',
    ghost: 'ghost',
    danger: 'outline',
  } as const;
  return (
    <PrimitiveButton
      ref={ref}
      size="sm"
      variant={mapped[variant]}
      className={`button ${variant} ${variant === 'danger' ? 'text-destructive' : ''} ${className}`}
      {...props}
    />
  );
});
export function Badge({
  status,
  children,
}: {
  status?: string;
  children?: ReactNode;
}) {
  return (
    <PrimitiveBadge variant="outline" className={`badge ${status || ''}`}>
      {children || statusNames[status || ''] || status}
    </PrimitiveBadge>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="modal">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? 'muted' : 'sr-only'}>
            {description || title}
          </DialogDescription>
        </DialogHeader>
        {children}
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
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
