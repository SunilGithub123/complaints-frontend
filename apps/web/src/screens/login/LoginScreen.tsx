/**
 * Staff login screen.
 *
 * Maps the backend's `POST /staff/auth/login` (Stage 1) to a single form.
 * Uses the orval-generated `useLogin` mutation hook (Stage 3) — no manual
 * fetch, no hand-rolled axios. Validation is driven by the generated zod
 * schema `loginBody` from `@complaints/api` extended with min(1) on the
 * password (the OpenAPI spec only enforces max length there).
 *
 * On success: persists the session triple into the Zustand auth store and
 * routes the staff to `/change-password` if the BE flagged
 * `passwordResetRequired`, otherwise to `/`.
 *
 * Per BRD §4.1 we deliberately do NOT disclose whether the employeeId
 * exists — every credential failure shows the same generic message.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useLogin, ApiError, type Schemas } from '@complaints/api';
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

const loginSchema = z.object({
  employeeId: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
});
type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginScreen(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { employeeId: '', password: '' },
  });

  const { mutateAsync, isPending } = useLogin();

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const response = await mutateAsync({ data: values });
      const envelope = (response as { data: Schemas.ApiResponseLoginResponse }).data;
      const payload = envelope.data;
      if (!payload || !payload.accessToken || !payload.refreshToken || !payload.staff) {
        setFormError(t('errors.generic'));
        return;
      }
      setSession({
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        staff: payload.staff,
      });
      navigate(payload.staff.passwordResetRequired ? '/change-password' : '/', {
        replace: true,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BAD_CREDENTIALS') {
        setFormError(t('errors.badCredentials'));
      } else if (err instanceof ApiError && err.status >= 500) {
        setFormError(t('errors.generic'));
      } else if (err instanceof ApiError) {
        setFormError(t('errors.badCredentials'));
      } else {
        setFormError(t('errors.network'));
      }
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('staff.login.title')}</CardTitle>
          <CardDescription>{t('staff.login.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="employeeId">{t('staff.login.employeeId')}</Label>
              <Input
                id="employeeId"
                autoComplete="username"
                aria-invalid={errors.employeeId ? true : undefined}
                aria-describedby={errors.employeeId ? 'employeeId-error' : undefined}
                placeholder={t('staff.login.employeeIdPlaceholder')}
                {...register('employeeId')}
              />
              {errors.employeeId ? (
                <p id="employeeId-error" className="text-xs text-[var(--color-danger-600)]">
                  {t('staff.login.employeeIdRequired')}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{t('staff.login.password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'password-error' : undefined}
                placeholder={t('staff.login.passwordPlaceholder')}
                {...register('password')}
              />
              {errors.password ? (
                <p id="password-error" className="text-xs text-[var(--color-danger-600)]">
                  {t('staff.login.passwordRequired')}
                </p>
              ) : null}
            </div>

            {formError ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={isPending}>
              {isPending ? t('staff.login.submitting') : t('staff.login.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

