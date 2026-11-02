import * as React from 'react';
import { cn } from '@/client/lib/utils';
import { ChevronDownIcon } from 'lucide-react';

function NativeSelect({
  className,
  size = 'default',
  layout = 'fill',
  wrapperClassName,
  ...props
}: Omit<React.ComponentProps<'select'>, 'size'> & {
  size?: 'sm' | 'default';
  layout?: 'fill' | 'fit';
  wrapperClassName?: string;
}) {
  return (
    <div
      className={cn(
        'group/native-select relative min-w-0',
        layout === 'fill' ? 'w-full' : 'w-fit',
        wrapperClassName,
      )}
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          'h-[var(--control-height)] w-full min-w-0 appearance-none rounded-md border border-input bg-background px-3 py-2 pr-9 text-[length:var(--text-control)] font-normal text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:opacity-100 disabled:bg-secondary disabled:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-[var(--control-height-compact)] data-[size=sm]:py-1',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground opacity-50 select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<'option'>) {
  return (
    <option
      data-slot="native-select-option"
      className={cn(
        'bg-popover text-popover-foreground disabled:text-[GrayText]',
        className,
      )}
      {...props}
    />
  );
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<'optgroup'>) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn(
        'bg-popover text-popover-foreground disabled:text-[GrayText]',
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
