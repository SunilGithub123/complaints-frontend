/**
 * Close-on-behalf dialog — engineer / admin only, available on RESOLVED
 * complaints (BE Stage 14).
 *
 * Body: { slaBreachReason?: string }.
 * - Required only if `complaint.slaBreached === true` AND
 *   `complaint.slaBreachReason` is null/empty (i.e. the technician
 *   didn't capture a reason at resolve time).
 * - Otherwise optional; the field isn't rendered at all when no
 *   reason is needed.
 *
 * BE error: `SLA_BREACH_REASON_REQUIRED` — surfaced as a field-level
 * error on the textarea (rare in practice because the FE pre-validates,
 * but the BE is the source of truth).
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useClose, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mapApiError } from '@/lib/apiErrors';

export interface CloseDialogProps {
  open: boolean;
  onClose: () => void;
  complaintId: number;
  slaBreached: boolean;
  /** Reason captured at technician-resolve time (Stage 14). */
  existingSlaBreachReason: string | null;
  onSuccess: () => void;
}

export function CloseDialog({
  open,
  onClose,
  complaintId,
  slaBreached,
  existingSlaBreachReason,
  onSuccess,
}: CloseDialogProps): React.JSX.Element {
  const t = useT();
  const { mutateAsync, isPending } = useClose();
  const [formError, setFormError] = useState<string | null>(null);

  const reasonRequired =
    slaBreached &&
    (existingSlaBreachReason === null ||
      existingSlaBreachReason.trim().length === 0);

  // Two schemas — keep the optional-path zero-fuss.
  const requiredMessage = t('complaints.close.slaBreachReasonRequired');
  const schema = reasonRequired
    ? z.object({
        slaBreachReason: z
          .string()
          .trim()
          .min(1, { message: requiredMessage })
          .max(500),
      })
    : z.object({ slaBreachReason: z.string().max(500).optional() });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { slaBreachReason: '' } as Values,
  });

  useEffect(() => {
    if (open) {
      setFormError(null);
      form.reset({ slaBreachReason: '' } as Values);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const data: Schemas.CloseComplaintRequest = {
      ...(values.slaBreachReason
        ? { slaBreachReason: values.slaBreachReason }
        : {}),
    };
    try {
      await mutateAsync({ id: complaintId, data });
      onSuccess();
    } catch (err) {
      const mapped = mapApiError(err, t);
      if (mapped.code === 'SLA_BREACH_REASON_REQUIRED') {
        form.setError('slaBreachReason', { message: mapped.message });
      }
      setFormError(mapped.message);
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={t('complaints.close.title')}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <p className="text-sm text-[var(--color-muted-500)]">
          {reasonRequired
            ? t('complaints.close.bodyBreached')
            : t('complaints.close.body')}
        </p>
        {reasonRequired ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="close-reason">
              {t('complaints.close.slaBreachReason')}
            </Label>
            <textarea
              id="close-reason"
              rows={4}
              maxLength={500}
              placeholder={t('complaints.close.slaBreachReasonPlaceholder')}
              aria-invalid={
                form.formState.errors.slaBreachReason ? true : undefined
              }
              className="flex w-full rounded-md border border-[var(--color-muted-200)] bg-white px-3 py-2 text-sm"
              {...form.register('slaBreachReason')}
            />
            {form.formState.errors.slaBreachReason ? (
              <p className="text-xs text-[var(--color-danger-600)]">
                {form.formState.errors.slaBreachReason.message ??
                  t('complaints.close.slaBreachReasonRequired')}
              </p>
            ) : null}
          </div>
        ) : null}
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
              ? t('complaints.close.submitting')
              : t('complaints.close.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

