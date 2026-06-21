/**
 * Create / edit dialog for a Subdivision. Mode is implied by whether
 * `initial` is null. Two different mutation hooks fire under the hood
 * (`useCreateSubdivision` vs `useUpdateSubdivision`) — they take
 * different payload shapes so we cannot unify them at the call-site,
 * but the form itself shares a single Zod schema + RHF wiring.
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useCreateSubdivision,
  useUpdateSubdivision,
  type Schemas,
} from '@complaints/api';
import { useT } from '@complaints/i18n';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mapApiError } from '@/lib/apiErrors';

const schema = z.object({
  code: z.string().min(1).max(50).regex(/^[A-Z0-9-]+$/),
  name: z.string().min(1).max(200),
  district: z.string().max(100).optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

export interface SubdivisionFormDialogProps {
  open: boolean;
  initial: Schemas.SubdivisionResponse | null;
  onClose: () => void;
  onSaved: () => void;
}

export function SubdivisionFormDialog({
  open,
  initial,
  onClose,
  onSaved,
}: SubdivisionFormDialogProps): React.JSX.Element {
  const t = useT();
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
    defaultValues: { code: '', name: '', district: '' },
  });

  useEffect(() => {
    if (open) {
      reset({
        code: initial?.code ?? '',
        name: initial?.name ?? '',
        district: initial?.district ?? '',
      });
      setFormError(null);
    }
  }, [open, initial, reset]);

  const { mutateAsync: doCreate, isPending: creating } = useCreateSubdivision();
  const { mutateAsync: doUpdate, isPending: updating } = useUpdateSubdivision();
  const isPending = creating || updating;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const payload: Schemas.SubdivisionRequest = {
      code: values.code,
      name: values.name,
      ...(values.district ? { district: values.district } : {}),
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
          setError(field as keyof FormValues, { message });
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
          ? t('masterdata.subdivisions.editTitle')
          : t('masterdata.subdivisions.createTitle')
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sd-code">{t('masterdata.common.code')}</Label>
          <Input
            id="sd-code"
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
          <Label htmlFor="sd-name">{t('masterdata.common.name')}</Label>
          <Input
            id="sd-name"
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
          <Label htmlFor="sd-district">{t('masterdata.subdivisions.district')}</Label>
          <Input id="sd-district" {...register('district')} />
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

