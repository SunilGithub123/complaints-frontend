/**
 * Reassign dialog — for non-terminal complaints that already have a
 * technician. Optional free-text reason (≤500 chars per BE).
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useReassignComplaint, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mapApiError } from '@/lib/apiErrors';
import { TechnicianPicker } from './TechnicianPicker';

const schema = z.object({
  technicianId: z.coerce.number().int().positive(),
  reason: z.string().max(500).optional(),
});
type Values = z.infer<typeof schema>;

export interface ReassignDialogProps {
  open: boolean;
  onClose: () => void;
  complaintId: number;
  distributionCenterId: number;
  currentTechnicianId: number | null;
  onSuccess: () => void;
}

export function ReassignDialog({
  open,
  onClose,
  complaintId,
  distributionCenterId,
  currentTechnicianId,
  onSuccess,
}: ReassignDialogProps): React.JSX.Element {
  const t = useT();
  const { mutateAsync, isPending } = useReassignComplaint();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { technicianId: 0, reason: '' },
  });

  useEffect(() => {
    if (open) {
      setFormError(null);
      form.reset({ technicianId: 0, reason: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const technicianId = form.watch('technicianId');
  const sameAsCurrent =
    currentTechnicianId !== null && technicianId === currentTechnicianId;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const data: Schemas.ReassignComplaintRequest = {
      technicianId: values.technicianId,
      ...(values.reason ? { reason: values.reason } : {}),
    };
    try {
      await mutateAsync({ id: complaintId, data });
      onSuccess();
    } catch (err) {
      const mapped = mapApiError(err, t);
      if (
        mapped.code === 'TECHNICIAN_NOT_FOUND' ||
        mapped.code === 'TECHNICIAN_NOT_IN_DC'
      ) {
        form.setError('technicianId', { message: mapped.message });
      }
      setFormError(mapped.message);
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title={t('complaints.reassign.title')}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reassign-tech">{t('complaints.reassign.technician')}</Label>
          <TechnicianPicker
            id="reassign-tech"
            distributionCenterId={distributionCenterId}
            value={technicianId ? String(technicianId) : ''}
            onChange={(v) => form.setValue('technicianId', Number(v))}
            invalid={!!form.formState.errors.technicianId}
          />
          {form.formState.errors.technicianId ? (
            <p className="text-xs text-[var(--color-danger-600)]">
              {form.formState.errors.technicianId.message ?? ''}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reassign-reason">{t('complaints.reassign.reason')}</Label>
          <textarea
            id="reassign-reason"
            rows={3}
            maxLength={500}
            placeholder={t('complaints.reassign.reasonPlaceholder')}
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
          <Button type="submit" disabled={isPending || !technicianId || sameAsCurrent}>
            {isPending
              ? t('complaints.reassign.submitting')
              : t('complaints.reassign.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

