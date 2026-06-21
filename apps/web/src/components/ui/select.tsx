import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Styled wrapper around the native <select>. We use the native element
 * (rather than a radix combobox) for accessibility for free and zero
 * bundle cost.
 */
export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-[var(--color-muted-200)] bg-white px-3 py-2 text-sm',
        'shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-[var(--color-danger-600)]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

