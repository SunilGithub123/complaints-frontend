/**
 * First-login change password screen. Backend (Stage 1) requires this for
 * every freshly-created staff account; until they comply, the guard in
 * `auth/guards.tsx` keeps redirecting them here.
 *
 * Password rules mirror the backend regex from `OpenApiConfig` /
 * `ChangePasswordRequest`: min 12 chars, lower + upper + digit + symbol.
 * We intentionally validate locally with the same regex so the user gets
 * inline feedback instead of a round-trip 400.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useChangePassword, useRefresh, ApiError, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { useAuthStore } from '@/auth/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

function buildSchema(t: ReturnType<typeof useT>) {
  return z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z
        .string()
        .min(12, { message: t('staff.changePassword.tooShort') })
        .max(200)
        .regex(COMPLEXITY, { message: t('staff.changePassword.complexity') }),
      confirmPassword: z.string().min(1),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      path: ['confirmPassword'],
      message: t('staff.changePassword.mismatch'),
    });
}

type ChangePasswordValues = z.infer<ReturnType<typeof buildSchema>>;

export default function ChangePasswordScreen(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const setStaff = useAuthStore((s) => s.setStaff);
  const getRefreshToken = useAuthStore((s) => s.refreshToken);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(buildSchema(t)),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const { mutateAsync: doChangePassword, isPending: changing } = useChangePassword();
  const { mutateAsync: doRefresh, isPending: refreshing } = useRefresh();
  const isPending = changing || refreshing;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const changeResponse = await doChangePassword({
        data: { currentPassword: values.currentPassword, newPassword: values.newPassword },
      });
      const changeEnvelope = (changeResponse as {
        data: Schemas.ApiResponseStaffSummaryResponse;
      }).data;
      const updatedStaff = changeEnvelope.data;

      // The access token issued at login still carries the old
      // `passwordResetRequired = true` claim, so every protected call
      // would be 403'd by the BE auth filter. Force a token refresh so
      // the BE re-issues a JWT against the updated DB state, then update
      // the session triple before navigating.
      if (getRefreshToken) {
        const refreshResponse = await doRefresh({ data: { refreshToken: getRefreshToken } });
        const refreshEnvelope = (refreshResponse as {
          data: Schemas.ApiResponseLoginResponse;
        }).data;
        const payload = refreshEnvelope.data;
        if (payload?.accessToken && payload.refreshToken && payload.staff) {
          setSession({
            accessToken: payload.accessToken,
            refreshToken: payload.refreshToken,
            staff: payload.staff,
          });
        } else if (updatedStaff) {
          setStaff(updatedStaff);
        }
      } else if (updatedStaff) {
        setStaff(updatedStaff);
      }

      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message || t('errors.generic'));
      } else {
        setFormError(t('errors.network'));
      }
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('staff.changePassword.title')}</CardTitle>
          <CardDescription>{t('staff.changePassword.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currentPassword">
                {t('staff.changePassword.currentPassword')}
              </Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.currentPassword ? true : undefined}
                {...register('currentPassword')}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newPassword">
                {t('staff.changePassword.newPassword')}
              </Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.newPassword ? true : undefined}
                aria-describedby={errors.newPassword ? 'newPassword-error' : undefined}
                {...register('newPassword')}
              />
              {errors.newPassword ? (
                <p id="newPassword-error" className="text-xs text-[var(--color-danger-600)]">
                  {errors.newPassword.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">
                {t('staff.changePassword.confirmPassword')}
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.confirmPassword ? true : undefined}
                aria-describedby={
                  errors.confirmPassword ? 'confirmPassword-error' : undefined
                }
                {...register('confirmPassword')}
              />
              {errors.confirmPassword ? (
                <p
                  id="confirmPassword-error"
                  className="text-xs text-[var(--color-danger-600)]"
                >
                  {errors.confirmPassword.message}
                </p>
              ) : null}
            </div>

            {formError ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={isPending}>
              {isPending
                ? t('staff.changePassword.submitting')
                : t('staff.changePassword.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

