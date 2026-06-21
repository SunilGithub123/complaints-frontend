/**
 * Tiny toast system. The Zustand store + a single mounted Viewport is
 * enough for our needs (non-blocking confirm-style messages). We did
 * NOT add @radix-ui/react-toast — saves ~6 KB gzipped from the entry
 * chunk, which the bundle budget can't easily absorb today.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { cn } from '@/lib/utils';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastStore {
  items: ToastItem[];
  show: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let nextId = 0;
const AUTO_DISMISS_MS = 5000;

const useToastStore = create<ToastStore>((set) => ({
  items: [],
  show: (message, tone = 'info') => {
    const id = ++nextId;
    set((s) => ({ items: [...s.items, { id, message, tone }] }));
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
      }, AUTO_DISMISS_MS);
    }
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

/**
 * Imperative API for callers outside React (rare — most calls happen
 * from screens via `useToast`). Kept as a thin re-export to discourage
 * the pattern of importing the store directly.
 */
export const toast = {
  info: (m: string) => useToastStore.getState().show(m, 'info'),
  success: (m: string) => useToastStore.getState().show(m, 'success'),
  warning: (m: string) => useToastStore.getState().show(m, 'warning'),
  danger: (m: string) => useToastStore.getState().show(m, 'danger'),
};

export function useToast(): { show: (message: string, tone?: ToastTone) => void } {
  const show = useToastStore((s) => s.show);
  return { show };
}

export function ToastViewport(): React.JSX.Element {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  // Restart the visible auto-dismiss timer when items change (no-op for empty list).
  useEffect(() => {
    // Per-toast timers live in the store; nothing to do here, but keeping
    // this hook so future side-effects (sound, vibration) have a home.
  }, [items]);

  if (items.length === 0) return <></>;

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-md',
            t.tone === 'success' &&
              'bg-white border-[var(--color-success-600)]/40 text-[var(--color-success-600)]',
            t.tone === 'warning' &&
              'bg-white border-[var(--color-danger-600)]/40 text-[var(--color-muted-900)]',
            t.tone === 'danger' &&
              'bg-[var(--color-danger-50)] border-[var(--color-danger-600)]/40 text-[var(--color-danger-600)]',
            t.tone === 'info' &&
              'bg-white border-[var(--color-muted-200)] text-[var(--color-muted-900)]',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="text-xs text-[var(--color-muted-500)] hover:text-[var(--color-muted-900)]"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

