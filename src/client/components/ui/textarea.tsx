import * as React from 'react';
import { cn } from '@/client/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-fixed min-h-[var(--textarea-min-height)] w-full rounded-md border border-input bg-transparent px-3 py-2 text-[length:var(--text-control)] shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-secondary disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20  dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
