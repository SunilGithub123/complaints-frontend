/**
 * Modal that reveals a one-time temporary password to the admin who just
 * created (or reset) a staff account. Strict rules:
 *
 *  - The password is NEVER persisted to localStorage / sessionStorage.
 *  - Component state holds it only while the dialog is open. Closing the
 *    dialog drops the reference and React GCs it.
 *  - Never logged via console.* — copy-to-clipboard is the only outbound.
 *  - The viewport-mounted ToastViewport already auto-dismisses; we use a
 *    single inline "Copied" indicator instead of a toast so screen
 *    readers announce it in context.
 */
import { useState } from 'react';
import { useT } from '@complaints/i18n';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface TempPasswordDialogProps {
  open: boolean;
  /** Held in caller's component state so we can render after a reset/create. */
  temporaryPassword: string | null;
  employeeId: string;
  fullName: string;
  onClose: () => void;
}

export function TempPasswordDialog({
  open,
  temporaryPassword,
  employeeId,
  fullName,
  onClose,
}: TempPasswordDialogProps): React.JSX.Element {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard write may fail in non-HTTPS or sandboxed contexts.
      // The password is still visible in the dialog as a fallback.
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        setCopied(false);
        onClose();
      }}
      title={t('adminStaff.tempPassword.title')}
      description={t('adminStaff.tempPassword.intro', {
        name: fullName,
        employeeId,
      })}
    >
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertDescription>{t('adminStaff.tempPassword.warning')}</AlertDescription>
        </Alert>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            {t('adminStaff.tempPassword.label')}
          </span>
          <code
            aria-label={t('adminStaff.tempPassword.label')}
            className="rounded-md border border-[var(--color-muted-200)] bg-[var(--color-muted-50)] px-3 py-2 font-mono text-sm break-all"
          >
            {temporaryPassword ?? ''}
          </code>
          {copied ? (
            <span
              role="status"
              className="text-xs text-[var(--color-success-600)]"
            >
              {t('common.copied')}
            </span>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void handleCopy();
            }}
            disabled={!temporaryPassword}
          >
            {t('adminStaff.tempPassword.copy')}
          </Button>
          <Button
            type="button"
            onClick={() => {
              setCopied(false);
              onClose();
            }}
          >
            {t('adminStaff.tempPassword.done')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

