import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-[var(--color-muted-200)] bg-white px-3 py-2 text-sm',
        'placeholder:text-[var(--color-muted-500)] shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-[var(--color-danger-600)] aria-invalid:focus-visible:ring-[var(--color-danger-600)]',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

