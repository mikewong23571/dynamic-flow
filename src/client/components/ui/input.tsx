import * as React from 'react';
import { cn } from '@/client/lib/utils';

function Input({
  className,
  type,
  controlSize = 'default',
  ...props
}: React.ComponentProps<'input'> & { controlSize?: 'default' | 'sm' }) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={controlSize}
      className={cn(
        'h-[var(--control-height)] data-[size=sm]:h-[var(--control-height-compact)] w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-[length:var(--text-control)] shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-secondary disabled:text-muted-foreground ',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
