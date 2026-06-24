/**
 * Mark-as-duplicate dialog — for SUBMITTED complaints. Takes the parent
 * complaint's ticket number (not its numeric ID — BE accepts the
 * customer-facing CMP-… string).
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMarkComplaintDuplicate, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mapApiError } from '@/lib/apiErrors';

const schema = z.object({
  parentTicketNo: z.string().min(1).max(20),
  reason: z.string().max(500).optional(),
});
type Values = z.infer<typeof schema>;

export interface MarkDuplicateDialogProps {
  open: boolean;
  onClose: () => void;
  complaintId: number;
  ownTicketNo: string | null;
  onSuccess: () => void;
}

export function MarkDuplicateDialog({
  open,
  onClose,
  complaintId,
  ownTicketNo,
  onSuccess,
}: MarkDuplicateDialogProps): React.JSX.Element {
  const t = useT();
  const { mutateAsync, isPending } = useMarkComplaintDuplicate();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { parentTicketNo: '', reason: '' },
  });

  useEffect(() => {
    if (open) {
      setFormError(null);
      form.reset({ parentTicketNo: '', reason: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    // Cheap pre-check — the BE also enforces this with
    // SELF_REFERENCING_DUPLICATE, but fail fast in the UI.
    if (ownTicketNo && values.parentTicketNo.trim() === ownTicketNo) {
      form.setError('parentTicketNo', {
        message: t('errors.SELF_REFERENCING_DUPLICATE'),
      });
      return;
    }
    const data: Schemas.MarkDuplicateRequest = {
      parentTicketNo: values.parentTicketNo.trim(),
      ...(values.reason ? { reason: values.reason } : {}),
    };
    try {
      await mutateAsync({ id: complaintId, data });
      onSuccess();
    } catch (err) {
      const mapped = mapApiError(err, t);
      if (
        mapped.code === 'DUPLICATE_PARENT_NOT_FOUND' ||
        mapped.code === 'SELF_REFERENCING_DUPLICATE'
      ) {
        form.setError('parentTicketNo', { message: mapped.message });
      }
      setFormError(mapped.message);
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={t('complaints.markDuplicate.title')}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dup-parent">{t('complaints.markDuplicate.parentTicket')}</Label>
          <Input
            id="dup-parent"
            placeholder={t('complaints.markDuplicate.parentTicketPlaceholder')}
            aria-invalid={form.formState.errors.parentTicketNo ? true : undefined}
            {...form.register('parentTicketNo')}
          />
          {form.formState.errors.parentTicketNo ? (
            <p className="text-xs text-[var(--color-danger-600)]">
              {form.formState.errors.parentTicketNo.message ??
                t('complaints.markDuplicate.parentTicketRequired')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dup-reason">{t('complaints.markDuplicate.reason')}</Label>
          <textarea
            id="dup-reason"
            rows={3}
            maxLength={500}
            placeholder={t('complaints.markDuplicate.reasonPlaceholder')}
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
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? t('complaints.markDuplicate.submitting')
              : t('complaints.markDuplicate.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

