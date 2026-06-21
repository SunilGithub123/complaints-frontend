/**
 * Create / edit dialog for a Distribution Centre.
 *
 * Mode is implied by whether `initial` is null. Per spec: the
 * subdivisionId is *derived from the signed-in admin's token* — we do
 * NOT show a picker. (Admins are scoped to a single subdivision in
 * Phase 1; cross-subdivision tooling lands later.)
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useCreateDistributionCenter,
  useUpdateDistributionCenter,
  type Schemas,
} from '@complaints/api';
import { useT } from '@complaints/i18n';
import { useAuthStore, selectStaff } from '@/auth/authStore';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mapApiError } from '@/lib/apiErrors';

const schema = z.object({
  code: z.string().min(1).max(50).regex(/^[A-Z0-9-]+$/),
  name: z.string().min(1).max(200),
  address: z.string().max(1000).optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

export interface DistributionCenterFormDialogProps {
  open: boolean;
  initial: Schemas.DistributionCenterResponse | null;
  onClose: () => void;
  onSaved: () => void;
}

export function DistributionCenterFormDialog({
  open,
  initial,
  onClose,
  onSaved,
}: DistributionCenterFormDialogProps): React.JSX.Element {
  const t = useT();
  const staff = useAuthStore(selectStaff);
  const isEdit = initial !== null;
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', address: '' },
  });

  useEffect(() => {
    if (open) {
      reset({
        code: initial?.code ?? '',
        name: initial?.name ?? '',
        address: initial?.address ?? '',
      });
      setFormError(null);
    }
  }, [open, initial, reset]);

  const { mutateAsync: doCreate, isPending: creating } = useCreateDistributionCenter();
  const { mutateAsync: doUpdate, isPending: updating } = useUpdateDistributionCenter();
  const isPending = creating || updating;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    // For edit, the subdivision is fixed; for create it must come from the
    // signed-in admin's token (token claim already enforces scope server-side).
    const subdivisionId = initial?.subdivisionId ?? staff?.subdivisionId;
    if (subdivisionId === undefined || subdivisionId === null) {
      setFormError(t('errors.generic'));
      return;
    }
    const payload: Schemas.DistributionCenterRequest = {
      subdivisionId,
      code: values.code,
      name: values.name,
      ...(values.address ? { address: values.address } : {}),
    };
    try {
      if (isEdit && initial?.id !== undefined) {
        await doUpdate({ id: initial.id, data: payload });
      } else {
        await doCreate({ data: payload });
      }
      onSaved();
    } catch (err) {
      const mapped = mapApiError(err, t);
      if (mapped.fieldErrors) {
        for (const [field, message] of Object.entries(mapped.fieldErrors)) {
          if (field === 'code' || field === 'name' || field === 'address') {
            setError(field, { message });
          }
        }
      }
      setFormError(mapped.message);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t('masterdata.distributionCenters.editTitle')
          : t('masterdata.distributionCenters.createTitle')
      }
      description={
        isEdit ? undefined : t('masterdata.distributionCenters.scopedToYourSubdivision')
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dc-code">{t('masterdata.common.code')}</Label>
          <Input
            id="dc-code"
            disabled={isEdit}
            aria-invalid={errors.code ? true : undefined}
            {...register('code')}
          />
          {errors.code ? (
            <p className="text-xs text-[var(--color-danger-600)]">
              {errors.code.message ?? t('masterdata.common.codePattern')}
            </p>
          ) : (
            <p className="text-xs text-[var(--color-muted-500)]">
              {t('masterdata.common.codePattern')}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dc-name">{t('masterdata.common.name')}</Label>
          <Input
            id="dc-name"
            aria-invalid={errors.name ? true : undefined}
            {...register('name')}
          />
          {errors.name ? (
            <p className="text-xs text-[var(--color-danger-600)]">
              {errors.name.message ?? t('masterdata.common.required')}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dc-address">{t('masterdata.distributionCenters.address')}</Label>
          <Input id="dc-address" {...register('address')} />
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
            {isEdit
              ? isPending
                ? t('common.saving')
                : t('common.save')
              : isPending
                ? t('common.creating')
                : t('common.create')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

