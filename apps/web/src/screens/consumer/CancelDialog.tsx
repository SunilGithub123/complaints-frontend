/**
 * Cancel dialog — visible only when status === 'SUBMITTED' (BE Stage 18).
 *
 * Body: { reason?: string } (≤500 chars). Field is optional — the
 * consumer can cancel without explaining themselves.
 *
 * Error handling:
 *  - 403 COMPLAINT_NOT_OWNED_BY_CONSUMER → JWT mis-binding (e.g. the
 *    consumer re-OTP'd as someone else and old tabs lingered).
 *    Treat as session expired: clear the consumer store and bubble up.
 *  - 409 COMPLAINT_NOT_IN_SUBMITTED_STATE → status changed under us
 *    (engineer assigned in the meantime). Surface a friendly message
 *    and let the parent refetch + hide the Cancel button.
 *  - Anything else → generic alert in the dialog.
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCancelComplaint, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mapApiError } from '@/lib/apiErrors';
import { useConsumerAuthStore } from '@/features/consumer/consumerAuthStore';

const schema = z.object({
  reason: z.string().max(500).optional(),
});
type Values = z.infer<typeof schema>;

export interface CancelDialogProps {
  open: boolean;
  onClose: () => void;
  ticketNo: string;
  /** Called after a 200 cancel. */
  onSuccess: () => void;
  /**
   * Called when BE returns 409 COMPLAINT_NOT_IN_SUBMITTED_STATE — the
   * parent should refetch detail (and hide the Cancel button on the
   * fresh status).
   */
  onStaleStatus: () => void;
  /**
   * Called when BE returns 403 COMPLAINT_NOT_OWNED_BY_CONSUMER —
   * consumer store has been cleared; navigate back to /consumer.
   */
  onSessionLost: () => void;
}

export function CancelDialog({
  open,
  onClose,
  ticketNo,
  onSuccess,
  onStaleStatus,
  onSessionLost,
}: CancelDialogProps): React.JSX.Element {
  const t = useT();
  const { mutateAsync, isPending } = useCancelComplaint();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '' },
  });

  useEffect(() => {
    if (open) {
      setFormError(null);
      form.reset({ reason: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const data: Schemas.CancelComplaintRequest = values.reason
      ? { reason: values.reason }
      : {};
    try {
      await mutateAsync({ ticketNo, data });
      onSuccess();
    } catch (err) {
      const mapped = mapApiError(err, t);
      if (mapped.code === 'COMPLAINT_NOT_OWNED_BY_CONSUMER') {
        useConsumerAuthStore.getState().clear();
        onSessionLost();
        return;
      }
      if (mapped.code === 'COMPLAINT_NOT_IN_SUBMITTED_STATE') {
        onStaleStatus();
        return;
      }
      setFormError(mapped.message);
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={t('consumer.cancel.title')}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <p className="text-sm text-[var(--color-muted-500)]">
          {t('consumer.cancel.body')}
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cancel-reason">{t('consumer.cancel.reason')}</Label>
          <textarea
            id="cancel-reason"
            rows={4}
            maxLength={500}
            placeholder={t('consumer.cancel.reasonPlaceholder')}
            className="flex w-full rounded-md border border-[var(--color-muted-200)] bg-white px-3 py-2 text-sm"
            {...form.register('reason')}
          />
        </div>
        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('consumer.cancel.keep')}
          </Button>
          <Button type="submit" variant="danger" disabled={isPending}>
            {isPending
              ? t('consumer.cancel.submitting')
              : t('consumer.cancel.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}


