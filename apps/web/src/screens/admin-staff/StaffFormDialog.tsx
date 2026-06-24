/**
 * Create / edit dialog for a Staff member.
 *
 *  - Create payload: CreateStaffRequest (employeeId, fullName, role,
 *    optional email/mobile, subdivisionId, optional distributionCenterId).
 *    `subdivisionId` is derived from the signed-in admin's token (server
 *    side enforces scope; we just send it).
 *  - Edit payload: UpdateStaffRequest (fullName + optional email/mobile +
 *    optional distributionCenterId). The BE does NOT permit role,
 *    employeeId, or subdivision changes from this endpoint.
 *
 * Role-dependent UI: ENGINEER & TECHNICIAN must have a DC selection.
 * We don't load every DC eagerly for the picker — we use the same
 * `useListDistributionCenters` hook that the masterdata read screen uses, scoped via
 * pageable. For Phase 2 the active DC count per subdivision is small
 * (≤ a few dozen) so a single page of 100 is enough.
 */
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useListDistributionCenters,
  type Schemas,
} from '@complaints/api';
import { useT } from '@complaints/i18n';
import { useAuthStore, selectStaff } from '@/auth/authStore';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mapApiError } from '@/lib/apiErrors';

const ROLES = ['ADMIN', 'ENGINEER', 'TECHNICIAN'] as const;
type Role = (typeof ROLES)[number];

const baseShape = {
  fullName: z.string().min(1).max(200),
  email: z.string().email().max(200).optional().or(z.literal('')),
  mobile: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/)
    .optional()
    .or(z.literal('')),
  distributionCenterId: z
    .union([z.literal(''), z.coerce.number().int().positive()])
    .optional(),
};

const createSchema = z
  .object({
    employeeId: z.string().min(1).max(50).regex(/^[A-Z0-9-]+$/),
    role: z.enum(ROLES),
    ...baseShape,
  })
  .refine(
    (v) =>
      v.role === 'ADMIN' ||
      (typeof v.distributionCenterId === 'number' && v.distributionCenterId > 0),
    { path: ['distributionCenterId'], message: 'required' },
  );

const editSchema = z.object(baseShape);

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

export interface StaffFormDialogProps {
  open: boolean;
  initial: Schemas.StaffListItemResponse | null;
  onClose: () => void;
  /** Called with the temp password to display when a create succeeds. */
  onCreated: (result: {
    employeeId: string;
    fullName: string;
    temporaryPassword: string;
  }) => void;
  onUpdated: () => void;
  /** Injected so the screen owns the mutation hook calls (keeps this file lean). */
  createMutation: {
    mutateAsync: (vars: { data: Schemas.CreateStaffRequest }) => Promise<unknown>;
    isPending: boolean;
  };
  updateMutation: {
    mutateAsync: (vars: {
      id: number;
      data: Schemas.UpdateStaffRequest;
    }) => Promise<unknown>;
    isPending: boolean;
  };
}

interface DcOption {
  id: number;
  label: string;
}

export function StaffFormDialog({
  open,
  initial,
  onClose,
  onCreated,
  onUpdated,
  createMutation,
  updateMutation,
}: StaffFormDialogProps): React.JSX.Element {
  const t = useT();
  const staff = useAuthStore(selectStaff);
  const isEdit = initial !== null;
  const [formError, setFormError] = useState<string | null>(null);

  // DC picker source (Phase 2: single page is enough).
  const dcQuery = useListDistributionCenters({ pageable: { page: 0, size: 100, sort: ['code,asc'] } });
  const dcs: DcOption[] = useMemo(() => {
    const env = (dcQuery.data as
      | { data: Schemas.ApiResponsePageResponseDistributionCenterResponse }
      | undefined)?.data;
    const content = env?.data?.content ?? [];
    return content
      .filter((d) => d.id !== undefined && d.active !== false)
      .map((d) => ({ id: d.id as number, label: `${d.code ?? ''} — ${d.name ?? ''}` }));
  }, [dcQuery.data]);

  // We bifurcate the schema by mode because the BE bifurcates the payload.
  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      employeeId: '',
      role: 'TECHNICIAN',
      fullName: '',
      email: '',
      mobile: '',
      distributionCenterId: '',
    },
  });
  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { fullName: '', email: '', mobile: '', distributionCenterId: '' },
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (isEdit && initial) {
      editForm.reset({
        fullName: initial.fullName ?? '',
        email: initial.email ?? '',
        mobile: initial.mobile ?? '',
        distributionCenterId: initial.distributionCenterId ?? '',
      });
    } else {
      createForm.reset({
        employeeId: '',
        role: 'TECHNICIAN',
        fullName: '',
        email: '',
        mobile: '',
        distributionCenterId: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, initial]);

  const watchedRole = createForm.watch('role') as Role;
  const dcRequired = !isEdit && watchedRole !== 'ADMIN';

  const onSubmitCreate = createForm.handleSubmit(async (values) => {
    setFormError(null);
    const subdivisionId = staff?.subdivisionId;
    if (subdivisionId === undefined || subdivisionId === null) {
      setFormError(t('errors.generic'));
      return;
    }
    const payload: Schemas.CreateStaffRequest = {
      employeeId: values.employeeId,
      fullName: values.fullName,
      role: values.role,
      subdivisionId,
      ...(values.email ? { email: values.email } : {}),
      ...(values.mobile ? { mobile: values.mobile } : {}),
      ...(typeof values.distributionCenterId === 'number'
        ? { distributionCenterId: values.distributionCenterId }
        : {}),
    };
    try {
      const res = (await createMutation.mutateAsync({ data: payload })) as {
        data?: { data?: Schemas.ResetStaffPasswordResponse };
      };
      const created = res?.data?.data;
      if (created?.temporaryPassword) {
        onCreated({
          employeeId: created.employeeId ?? values.employeeId,
          fullName: values.fullName,
          temporaryPassword: created.temporaryPassword,
        });
      } else {
        // No temp password in response (unexpected) — treat as success without reveal.
        onUpdated();
      }
    } catch (err) {
      const mapped = mapApiError(err, t);
      if (mapped.code === 'EMPLOYEE_ID_TAKEN') {
        createForm.setError('employeeId', { message: mapped.message });
      }
      if (mapped.fieldErrors) {
        for (const [field, message] of Object.entries(mapped.fieldErrors)) {
          if (
            field === 'employeeId' ||
            field === 'fullName' ||
            field === 'email' ||
            field === 'mobile' ||
            field === 'distributionCenterId' ||
            field === 'role'
          ) {
            createForm.setError(field as keyof CreateValues, { message });
          }
        }
      }
      setFormError(mapped.message);
    }
  });

  const onSubmitEdit = editForm.handleSubmit(async (values) => {
    setFormError(null);
    if (!initial?.id) return;
    const payload: Schemas.UpdateStaffRequest = {
      fullName: values.fullName,
      ...(values.email ? { email: values.email } : {}),
      ...(values.mobile ? { mobile: values.mobile } : {}),
      ...(typeof values.distributionCenterId === 'number'
        ? { distributionCenterId: values.distributionCenterId }
        : {}),
    };
    try {
      await updateMutation.mutateAsync({ id: initial.id, data: payload });
      onUpdated();
    } catch (err) {
      const mapped = mapApiError(err, t);
      if (mapped.fieldErrors) {
        for (const [field, message] of Object.entries(mapped.fieldErrors)) {
          if (
            field === 'fullName' ||
            field === 'email' ||
            field === 'mobile' ||
            field === 'distributionCenterId'
          ) {
            editForm.setError(field as keyof EditValues, { message });
          }
        }
      }
      setFormError(mapped.message);
    }
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        isEdit ? t('adminStaff.form.editTitle') : t('adminStaff.form.createTitle')
      }
    >
      {isEdit ? (
        <form className="flex flex-col gap-4" onSubmit={onSubmitEdit} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-fullName">{t('adminStaff.form.fullName')}</Label>
            <Input
              id="st-fullName"
              aria-invalid={editForm.formState.errors.fullName ? true : undefined}
              {...editForm.register('fullName')}
            />
            {editForm.formState.errors.fullName ? (
              <p className="text-xs text-[var(--color-danger-600)]">
                {editForm.formState.errors.fullName.message ?? t('masterdata.common.required')}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-email">{t('adminStaff.form.email')}</Label>
            <Input id="st-email" type="email" {...editForm.register('email')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-mobile">{t('adminStaff.form.mobile')}</Label>
            <Input id="st-mobile" inputMode="tel" {...editForm.register('mobile')} />
            <p className="text-xs text-[var(--color-muted-500)]">
              {t('adminStaff.form.mobileHelp')}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-dc">{t('adminStaff.form.distributionCenterId')}</Label>
            <Select id="st-dc" {...editForm.register('distributionCenterId')}>
              <option value="">{t('adminStaff.form.selectDc')}</option>
              {dcs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-[var(--color-muted-500)]">
              {t('adminStaff.form.distributionCenterIdHelp')}
            </p>
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
              {isPending ? t('adminStaff.form.saving') : t('adminStaff.form.save')}
            </Button>
          </div>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={onSubmitCreate} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-employeeId">{t('adminStaff.form.employeeId')}</Label>
            <Input
              id="st-employeeId"
              aria-invalid={createForm.formState.errors.employeeId ? true : undefined}
              {...createForm.register('employeeId')}
            />
            {createForm.formState.errors.employeeId ? (
              <p className="text-xs text-[var(--color-danger-600)]">
                {createForm.formState.errors.employeeId.message ??
                  t('adminStaff.form.employeeIdHelp')}
              </p>
            ) : (
              <p className="text-xs text-[var(--color-muted-500)]">
                {t('adminStaff.form.employeeIdHelp')}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-fullName-c">{t('adminStaff.form.fullName')}</Label>
            <Input
              id="st-fullName-c"
              aria-invalid={createForm.formState.errors.fullName ? true : undefined}
              {...createForm.register('fullName')}
            />
            {createForm.formState.errors.fullName ? (
              <p className="text-xs text-[var(--color-danger-600)]">
                {createForm.formState.errors.fullName.message ?? t('masterdata.common.required')}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-role">{t('adminStaff.form.roleLabel')}</Label>
            <Select id="st-role" {...createForm.register('role')}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`adminStaff.role.${r}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-email-c">{t('adminStaff.form.email')}</Label>
            <Input id="st-email-c" type="email" {...createForm.register('email')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-mobile-c">{t('adminStaff.form.mobile')}</Label>
            <Input id="st-mobile-c" inputMode="tel" {...createForm.register('mobile')} />
            <p className="text-xs text-[var(--color-muted-500)]">
              {t('adminStaff.form.mobileHelp')}
            </p>
          </div>
          {dcRequired ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="st-dc-c">
                {t('adminStaff.form.distributionCenterId')}
              </Label>
              <Select
                id="st-dc-c"
                aria-invalid={
                  createForm.formState.errors.distributionCenterId ? true : undefined
                }
                {...createForm.register('distributionCenterId')}
              >
                <option value="">{t('adminStaff.form.selectDc')}</option>
                {dcs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
              {createForm.formState.errors.distributionCenterId ? (
                <p className="text-xs text-[var(--color-danger-600)]">
                  {createForm.formState.errors.distributionCenterId.message ??
                    t('masterdata.common.required')}
                </p>
              ) : (
                <p className="text-xs text-[var(--color-muted-500)]">
                  {t('adminStaff.form.distributionCenterIdHelp')}
                </p>
              )}
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
              {isPending ? t('adminStaff.form.submitting') : t('adminStaff.form.submit')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}



