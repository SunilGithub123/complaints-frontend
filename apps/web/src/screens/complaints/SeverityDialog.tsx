/**
 * Severity-only update — for non-SUBMITTED, non-terminal complaints.
 * (SUBMITTED uses the Assign flow which sets initial severity together
 * with the technician.)
 */
import { useEffect, useState } from 'react';
import { useUpdateSeverity, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mapApiError } from '@/lib/apiErrors';

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
type Severity = (typeof SEVERITIES)[number];

export interface SeverityDialogProps {
  open: boolean;
  onClose: () => void;
  complaintId: number;
  current: Severity | null;
  onSuccess: () => void;
}

export function SeverityDialog({
  open,
  onClose,
  complaintId,
  current,
  onSuccess,
}: SeverityDialogProps): React.JSX.Element {
  const t = useT();
  const { mutateAsync, isPending } = useUpdateSeverity();
  const [severity, setSeverity] = useState<Severity>(current ?? 'MEDIUM');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSeverity(current ?? 'MEDIUM');
      setError(null);
    }
  }, [open, current]);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const data: Schemas.UpdateSeverityRequest = { severity };
    try {
      await mutateAsync({ id: complaintId, data });
      onSuccess();
    } catch (err) {
      setError(mapApiError(err, t).message);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('complaints.severityDialog.title')}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        noValidate
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sev-only">{t('complaints.assign.severityLabel')}</Label>
          <Select
            id="sev-only"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {t(`complaints.severity.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isPending || severity === current}>
            {isPending
              ? t('complaints.severityDialog.submitting')
              : t('complaints.severityDialog.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

