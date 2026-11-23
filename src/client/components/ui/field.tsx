import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** Field owns label/help/error spacing; its parent owns spacing between fields. */
export function Field({
  className,
  label,
  help,
  error,
  children,
  ...props
}: ComponentProps<'label'> & {
  label?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
}) {
  return (
    <label data-slot="field" className={cn('form-field', className)} {...props}>
      {label}
      {children}
      {help && <span className="field-help">{help}</span>}
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

/** Shared alignment only: surrounding forms choose their own group spacing. */
export function FormActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="form-actions"
      className={cn('form-actions', className)}
      {...props}
    />
  );
}

/** Explicit field group preserves native fieldset disabling without styling every fieldset. */
export function FormFields({
  className,
  ...props
}: ComponentProps<'fieldset'>) {
  return (
    <fieldset
      data-slot="form-fields"
      className={cn('form-fields m-0 min-w-0 border-0 p-0', className)}
      {...props}
    />
  );
}
