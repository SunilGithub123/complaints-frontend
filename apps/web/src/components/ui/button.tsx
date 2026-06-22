/* eslint-disable react-refresh/only-export-components -- co-located constant / hook exports are intentional; HMR isn't meaningful for these files (route wiring / cva variants / store) */
/**
 * shadcn-style `Button` primitive (hand-authored — we explicitly did NOT
 * `npx shadcn add` the kitchen sink). Variants are intentionally minimal;
 * grow them only when a real screen needs the variant. CVA is overkill for
 * two variants but keeps the door open without a refactor.
 */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)]',
        secondary:
          'bg-[var(--color-muted-200)] text-[var(--color-muted-900)] hover:bg-[var(--color-muted-200)]/80',
        ghost:
          'hover:bg-[var(--color-muted-200)] text-[var(--color-muted-900)]',
        danger:
          'bg-[var(--color-danger-600)] text-white hover:bg-[var(--color-danger-600)]/90',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
        lg: 'h-11 px-6',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };