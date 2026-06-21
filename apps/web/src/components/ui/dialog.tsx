/**
 * Minimal modal dialog. Hand-rolled over the native `<dialog>` element +
 * a fixed-position backdrop — we deliberately did NOT pull
 * @radix-ui/react-dialog (saves ~10 KB gzipped from the entry chunk
 * and the bundle budget is tight at 50 KB headroom).
 *
 * Native `<dialog>` already handles: focus-trap, Esc-to-close (we re-fire
 * onClose), `inert` for the page behind, and accessibility tree.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: DialogProps): React.JSX.Element | null {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // jsdom doesn't implement showModal/close — fall back to the `open`
    // attribute so tests can still render the dialog content.
    if (open && !el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
    if (!open && el.open) {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function handleCancel(e: Event): void {
      e.preventDefault();
      onClose();
    }
    el.addEventListener('cancel', handleCancel);
    return () => el.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      aria-describedby={description ? 'dialog-description' : undefined}
      className={cn(
        'rounded-[var(--radius-card)] border border-[var(--color-muted-200)] bg-white p-0 shadow-xl',
        'backdrop:bg-black/40 backdrop:backdrop-blur-sm',
        'open:flex open:flex-col w-full max-w-md',
        className,
      )}
      onClick={(e) => {
        // Click on the backdrop (the dialog itself, outside content) closes.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="flex flex-col gap-1 border-b border-[var(--color-muted-200)] px-6 py-4">
        <h2 id="dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        {description ? (
          <p id="dialog-description" className="text-sm text-[var(--color-muted-500)]">
            {description}
          </p>
        ) : null}
      </header>
      <div className="px-6 py-4">{children}</div>
    </dialog>
  );
}

