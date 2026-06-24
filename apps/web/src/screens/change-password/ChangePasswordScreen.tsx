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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useChangeStaffPassword, ApiError, type Schemas } from '@complaints/api';
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
  const [searchParams] = useSearchParams();
  // `?from=profile` is set by the "Change password" CTA on /profile
  // (Stage 8b) so we can land back there on success instead of the
  // dashboard root. Anything else (or absent) defaults to '/'.
  const returnTo = searchParams.get('from') === 'profile' ? '/profile' : '/';
  const setSession = useAuthStore((s) => s.setSession);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(buildSchema(t)),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const { mutateAsync, isPending } = useChangeStaffPassword();

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      // The backend rotates tokens server-side as part of change-password
      // (Stage 1 post-hotfix): the response carries a fresh access +
      // refresh pair whose JWT claims reflect passwordResetRequired=false.
      // We just write the new session triple and navigate.
      const response = await mutateAsync({
        data: { currentPassword: values.currentPassword, newPassword: values.newPassword },
      });
      const envelope = (response as { data: Schemas.ApiResponseLoginResponse }).data;
      const payload = envelope.data;
      if (!payload?.accessToken || !payload.refreshToken || !payload.staff) {
        setFormError(t('errors.generic'));
        return;
      }
      setSession({
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        staff: payload.staff,
      });
      navigate(returnTo, { replace: true });
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

