/**
 * Reject dialog — for SUBMITTED complaints. Reason is required (≤500
 * chars per BE `RejectComplaintRequest`).
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useReject, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mapApiError } from '@/lib/apiErrors';

const schema = z.object({ reason: z.string().min(1).max(500) });
type Values = z.infer<typeof schema>;

export interface RejectDialogProps {
  open: boolean;
  onClose: () => void;
  complaintId: number;
  onSuccess: () => void;
}

export function RejectDialog({
  open,
  onClose,
  complaintId,
  onSuccess,
}: RejectDialogProps): React.JSX.Element {
  const t = useT();
  const { mutateAsync, isPending } = useReject();
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
    const data: Schemas.RejectComplaintRequest = { reason: values.reason };
    try {
      await mutateAsync({ id: complaintId, data });
      onSuccess();
    } catch (err) {
      setFormError(mapApiError(err, t).message);
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={t('complaints.reject.title')}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reject-reason">{t('complaints.reject.reason')}</Label>
          <textarea
            id="reject-reason"
            rows={4}
            maxLength={500}
            placeholder={t('complaints.reject.reasonPlaceholder')}
            aria-invalid={form.formState.errors.reason ? true : undefined}
            className="flex w-full rounded-md border border-[var(--color-muted-200)] bg-white px-3 py-2 text-sm"
            {...form.register('reason')}
          />
          {form.formState.errors.reason ? (
            <p className="text-xs text-[var(--color-danger-600)]">
              {t('complaints.reject.reasonRequired')}
            </p>
          ) : null}
        </div>
        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? t('complaints.reject.submitting')
              : t('complaints.reject.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

