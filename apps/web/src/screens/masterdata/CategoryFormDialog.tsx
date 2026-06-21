/**
 * Create / edit dialog for a Complaint Category. Same shape as the
 * Subdivision dialog; adds the optional `slaHours` field (1–720) which
 * the BE enforces. Pattern for `code` is `[A-Z0-9_]+` (note: underscore,
 * not hyphen — categories use SNAKE_CASE).
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useCreateCategory,
  useUpdateCategory,
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
  code: z.string().min(1).max(50).regex(/^[A-Z0-9_]+$/),
  name: z.string().min(1).max(200),
  slaHours: z
    .union([z.literal(''), z.coerce.number().int().min(1).max(720)])
    .optional(),
});
type FormValues = z.infer<typeof schema>;

export interface CategoryFormDialogProps {
  open: boolean;
  initial: Schemas.ComplaintCategoryResponse | null;
  onClose: () => void;
  onSaved: () => void;
}

export function CategoryFormDialog({
  open,
  initial,
  onClose,
  onSaved,
}: CategoryFormDialogProps): React.JSX.Element {
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
    defaultValues: { code: '', name: '', slaHours: '' },
  });

  useEffect(() => {
    if (open) {
      reset({
        code: initial?.code ?? '',
        name: initial?.name ?? '',
        slaHours: initial?.slaHours ?? '',
      });
      setFormError(null);
    }
  }, [open, initial, reset]);

  const { mutateAsync: doCreate, isPending: creating } = useCreateCategory();
  const { mutateAsync: doUpdate, isPending: updating } = useUpdateCategory();
  const isPending = creating || updating;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const payload: Schemas.ComplaintCategoryRequest = {
      code: values.code,
      name: values.name,
      ...(typeof values.slaHours === 'number' ? { slaHours: values.slaHours } : {}),
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
          if (field === 'code' || field === 'name' || field === 'slaHours') {
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
          ? t('masterdata.categories.editTitle')
          : t('masterdata.categories.createTitle')
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cat-code">{t('masterdata.common.code')}</Label>
          <Input
            id="cat-code"
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
          <Label htmlFor="cat-name">{t('masterdata.common.name')}</Label>
          <Input
            id="cat-name"
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
          <Label htmlFor="cat-sla">{t('masterdata.categories.slaHours')}</Label>
          <Input
            id="cat-sla"
            type="number"
            inputMode="numeric"
            min={1}
            max={720}
            aria-invalid={errors.slaHours ? true : undefined}
            {...register('slaHours')}
          />
          {errors.slaHours ? (
            <p className="text-xs text-[var(--color-danger-600)]">
              {errors.slaHours.message ?? t('masterdata.categories.slaRange')}
            </p>
          ) : (
            <p className="text-xs text-[var(--color-muted-500)]">
              {t('masterdata.categories.slaRange')}
            </p>
          )}
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

