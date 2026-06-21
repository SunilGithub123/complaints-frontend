/**
 * `cn` — combine Tailwind class strings with conflict resolution.
 * Standard shadcn helper. Keep it tiny; do not grow into a styling DSL.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

