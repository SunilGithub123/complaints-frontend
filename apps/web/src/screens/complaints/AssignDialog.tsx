/**
 * Assign dialog — for SUBMITTED complaints. Sets initial severity and
 * routes to a technician active in the complaint's distribution centre.
 * BE enforces DC scope; we just pre-filter the picker.
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAssign, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mapApiError } from '@/lib/apiErrors';
import { TechnicianPicker } from './TechnicianPicker';

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;

const schema = z.object({
  technicianId: z.coerce.number().int().positive(),
  severity: z.enum(SEVERITIES),
});
type Values = z.infer<typeof schema>;

export interface AssignDialogProps {
  open: boolean;
  onClose: () => void;
  complaintId: number;
  distributionCenterId: number;
  onSuccess: () => void;
}

export function AssignDialog({
  open,
  onClose,
  complaintId,
  distributionCenterId,
  onSuccess,
}: AssignDialogProps): React.JSX.Element {
  const t = useT();
  const { mutateAsync, isPending } = useAssign();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { technicianId: 0, severity: 'MEDIUM' },
  });

  useEffect(() => {
    if (open) {
      setFormError(null);
      form.reset({ technicianId: 0, severity: 'MEDIUM' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const data: Schemas.AssignComplaintRequest = {
      technicianId: values.technicianId,
      severity: values.severity,
    };
    try {
      await mutateAsync({ id: complaintId, data });
      onSuccess();
    } catch (err) {
      const mapped = mapApiError(err, t);
      if (
        mapped.code === 'INVALID_TECHNICIAN' ||
        mapped.code === 'TECHNICIAN_NOT_FOUND' ||
        mapped.code === 'TECHNICIAN_NOT_IN_DC'
      ) {
        form.setError('technicianId', { message: mapped.message });
      }
      setFormError(mapped.message);
    }
  });

  const technicianId = form.watch('technicianId');

  return (
    <Dialog open={open} onClose={onClose} title={t('complaints.assign.title')}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assign-tech">{t('complaints.assign.technician')}</Label>
          <TechnicianPicker
            id="assign-tech"
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
        <fieldset className="flex flex-col gap-1.5">
          <Label htmlFor="assign-sev">{t('complaints.assign.severityLabel')}</Label>
          <Select id="assign-sev" {...form.register('severity')}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {t(`complaints.severity.${s}`)}
              </option>
            ))}
          </Select>
        </fieldset>
        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isPending || !technicianId}>
            {isPending ? t('complaints.assign.submitting') : t('complaints.assign.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

