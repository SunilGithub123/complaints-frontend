/**
 * Profile editor — Stage 8b.
 *
 * Logged-in staff can update their own:
 *   - fullName (required, ≤ 200)
 *   - email    (optional, RFC-ish via zod)
 *   - mobile   (optional, BE pattern ^\+?[0-9]{7,15}$)
 *   - notificationsPushEnabled (toggle)
 *
 * The header is read-only — employeeId, role, subdivision, DC (the
 * last two resolved via existing masterdata read hooks; DC is hidden
 * for ADMINs since they aren't DC-scoped).
 *
 * On success we write the freshly-returned StaffSummaryResponse into
 * the auth store via `setValidatedStaff` (same path Stage 8a's
 * boot-time /me revalidation uses, so the cached snapshot stays the
 * single source of truth and `lastValidatedAt` reflects the
 * just-confirmed round-trip).
 *
 * Change-password is a link, not an inline form — the existing
 * `/change-password` screen handles it and now respects `?from=profile`
 * to bounce back here on success.
 *
 * Self-protection at this surface is implicit: there is no role / DC /
 * subdivision picker — those are admin actions on `/admin/staff` per
 * the Stage 8 prompt.
 */
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import {
  useUpdateMyStaffProfile,
  useGetSubdivision,
  useGetDistributionCenter,
  type Schemas,
} from '@complaints/api';
import { useT } from '@complaints/i18n';
import { useAuthStore, selectStaff } from '@/auth/authStore';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { mapApiError } from '@/lib/apiErrors';

function buildSchema(t: ReturnType<typeof useT>) {
  return z.object({
    fullName: z.string().min(1).max(200),
    email: z
      .union([z.literal(''), z.string().email({ message: t('staff.profile.emailInvalid') }).max(200)])
      .optional(),
    mobile: z
      .union([
        z.literal(''),
        z
          .string()
          .regex(/^\+?[0-9]{7,15}$/, { message: t('staff.profile.mobileInvalid') }),
      ])
      .optional(),
    notificationsPushEnabled: z.boolean(),
  });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

export default function ProfileScreen(): React.JSX.Element {
  const t = useT();
  const { show: toast } = useToast();
  const staff = useAuthStore(selectStaff);
  const setValidatedStaff = useAuthStore((s) => s.setValidatedStaff);

  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(buildSchema(t)),
    defaultValues: {
      fullName: staff?.fullName ?? '',
      email: '',
      mobile: '',
      notificationsPushEnabled: staff?.notificationsPushEnabled ?? false,
    },
  });

  // Re-seed when the staff snapshot changes (e.g. after Stage 8a /me
  // commit, or after a successful save here that bumps the store).
  useEffect(() => {
    reset({
      fullName: staff?.fullName ?? '',
      email: '',
      mobile: '',
      notificationsPushEnabled: staff?.notificationsPushEnabled ?? false,
    });
    // StaffSummaryResponse doesn't carry email / mobile (intentional —
    // it's the auth-time projection), so those fields start blank.
    // The BE accepts blank → keep current, set → overwrite. Documented
    // in `staff.profile.emailHelp` / `mobileHelp`.
  }, [staff?.id, staff?.fullName, staff?.notificationsPushEnabled, reset]);

  // Resolve subdivision + DC names (read-only header).
  const subdivisionQuery = useGetSubdivision(staff?.subdivisionId ?? 0, {
    query: { enabled: !!staff?.subdivisionId },
  });
  const dcQuery = useGetDistributionCenter(staff?.distributionCenterId ?? 0, {
    query: { enabled: !!staff?.distributionCenterId },
  });

  const subdivisionName = useMemo(() => {
    const env = (subdivisionQuery.data as
      | { data: Schemas.ApiResponseSubdivisionResponse }
      | undefined)?.data;
    return env?.data?.name ?? t('staff.profile.notSet');
  }, [subdivisionQuery.data, t]);

  const dcName = useMemo(() => {
    const env = (dcQuery.data as
      | { data: Schemas.ApiResponseDistributionCenterResponse }
      | undefined)?.data;
    return env?.data?.name ?? t('staff.profile.notSet');
  }, [dcQuery.data, t]);

  const { mutateAsync, isPending } = useUpdateMyStaffProfile();

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const payload: Schemas.UpdateMyProfileRequest = {
      fullName: values.fullName,
      notificationsPushEnabled: values.notificationsPushEnabled,
      ...(values.email ? { email: values.email } : {}),
      ...(values.mobile ? { mobile: values.mobile } : {}),
    };
    try {
      const res = (await mutateAsync({ data: payload })) as {
        data?: { data?: Schemas.StaffSummaryResponse };
      };
      const fresh = res?.data?.data;
      if (fresh) {
        // Same commit path Stage 8a uses for the boot-time /me round-trip
        // — keeps `lastValidatedAt` honest and avoids a divergent store path.
        setValidatedStaff(fresh);
      }
      toast(t('staff.profile.updatedToast'), 'success');
    } catch (err) {
      const mapped = mapApiError(err, t);
      if (mapped.fieldErrors) {
        for (const [field, message] of Object.entries(mapped.fieldErrors)) {
          if (
            field === 'fullName' ||
            field === 'email' ||
            field === 'mobile' ||
            field === 'notificationsPushEnabled'
          ) {
            setError(field as keyof FormValues, { message });
          }
        }
      }
      setFormError(mapped.message);
    }
  });

  if (!staff) return <></>;

  const showDc = staff.role !== 'ADMIN';

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold">{t('staff.profile.title')}</h2>
        <p className="text-sm text-[var(--color-muted-500)]">
          {t('staff.profile.subtitle')}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('staff.profile.summaryHeading')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SummaryRow label={t('staff.profile.employeeId')} value={staff.employeeId ?? ''} />
            <SummaryRow label={t('staff.profile.role')} value={staff.role ?? ''} />
            <SummaryRow label={t('staff.profile.subdivision')} value={subdivisionName} />
            {showDc ? (
              <SummaryRow label={t('staff.profile.distributionCenter')} value={dcName} />
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('staff.profile.formHeading')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-fullName">{t('staff.profile.fullName')}</Label>
              <Input
                id="pf-fullName"
                aria-invalid={errors.fullName ? true : undefined}
                {...register('fullName')}
              />
              {errors.fullName ? (
                <p className="text-xs text-[var(--color-danger-600)]">
                  {errors.fullName.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-email">{t('staff.profile.email')}</Label>
              <Input
                id="pf-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby="pf-email-help"
                {...register('email')}
              />
              {errors.email ? (
                <p className="text-xs text-[var(--color-danger-600)]">
                  {errors.email.message}
                </p>
              ) : (
                <p id="pf-email-help" className="text-xs text-[var(--color-muted-500)]">
                  {t('staff.profile.emailHelp')}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-mobile">{t('staff.profile.mobile')}</Label>
              <Input
                id="pf-mobile"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                aria-invalid={errors.mobile ? true : undefined}
                aria-describedby="pf-mobile-help"
                {...register('mobile')}
              />
              {errors.mobile ? (
                <p className="text-xs text-[var(--color-danger-600)]">
                  {errors.mobile.message}
                </p>
              ) : (
                <p id="pf-mobile-help" className="text-xs text-[var(--color-muted-500)]">
                  {t('staff.profile.mobileHelp')}
                </p>
              )}
            </div>

            <div className="flex items-start gap-2">
              <input
                id="pf-push"
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-[var(--color-muted-200)]"
                {...register('notificationsPushEnabled')}
              />
              <div className="flex flex-col">
                <Label htmlFor="pf-push">
                  {t('staff.profile.notificationsPushEnabled')}
                </Label>
                <p className="text-xs text-[var(--color-muted-500)]">
                  {t('staff.profile.notificationsPushEnabledHelp')}
                </p>
              </div>
            </div>

            {formError ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? t('staff.profile.saving') : t('staff.profile.save')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('staff.profile.changePasswordHeading')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-[var(--color-muted-500)]">
            {t('staff.profile.changePasswordBody')}
          </p>
          <div>
            {/* Link, not inline form. The existing /change-password screen
                reads `?from=profile` and navigates back here on success. */}
            <Link to="/change-password?from=profile">
              <Button type="button" variant="ghost">
                {t('staff.profile.changePasswordCta')}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-[var(--color-muted-500)]">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

