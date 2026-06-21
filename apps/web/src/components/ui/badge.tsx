import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'success' | 'muted' | 'danger';
}

export function Badge({
  className,
  tone = 'muted',
  ...props
}: BadgeProps): React.JSX.Element {
  const palette: Record<NonNullable<BadgeProps['tone']>, string> = {
    success: 'bg-[var(--color-success-600)]/10 text-[var(--color-success-600)]',
    muted: 'bg-[var(--color-muted-200)] text-[var(--color-muted-500)]',
    danger: 'bg-[var(--color-danger-50)] text-[var(--color-danger-600)]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        palette[tone],
        className,
      )}
      {...props}
    />
  );
}

