/**
 * `/consumer` — landing screen.
 *
 * Single small form: Consumer ID + Mobile. On submit, fires `sendOtp`
 * and (on 200) opens the OTP modal. Most of the heavy lifting lives in
 * `OtpModal`; this screen is the entry point.
 *
 * If the consumer is already verified (token still inside its 5-minute
 * window — e.g. came back via the browser back button after submitting),
 * we send them straight to `/consumer/submit` rather than asking them
 * to re-OTP. The `state.from` we may receive from
 * `ConsumerRequireVerification` lets us honour the page the guard
 * intercepted (the submit form or a refreshed confirmation).
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSendOtp, ApiError } from '@complaints/api';
import { useT } from '@complaints/i18n';
import {
  useConsumerAuthStore,
  selectIsVerified,
} from '@/features/consumer/consumerAuthStore';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mapApiError } from '@/lib/apiErrors';
import { OtpModal } from './OtpModal';

const landingSchema = z.object({
  consumerId: z.string().min(1).max(50),
  mobile: z
    .string()
    .min(1)
    .regex(/^\+?[0-9]{7,15}$/),
});
type LandingValues = z.infer<typeof landingSchema>;

interface FromState {
  from?: string;
}

export default function LandingScreen(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as FromState | null)?.from;

  const setIdentity = useConsumerAuthStore((s) => s.setIdentity);
  const isVerified = useConsumerAuthStore(selectIsVerified);

  const [otpOpen, setOtpOpen] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingIdentity, setPendingIdentity] = useState<LandingValues | null>(null);

  const sendMutation = useSendOtp();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LandingValues>({
    resolver: zodResolver(landingSchema),
    defaultValues: { consumerId: '', mobile: '' },
  });

  // Already-verified shortcut. Render a one-click resume rather than an
  // auto-navigate so the user understands why they didn't see the OTP
  // step (less spooky).
  if (isVerified) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t('consumer.landing.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>
                {t('consumer.confirmation.title')}
              </AlertDescription>
            </Alert>
            <Button onClick={() => navigate(from ?? '/consumer/submit', { replace: true })}>
              {t('consumer.otp.verify')}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await sendMutation.mutateAsync({ data: values });
      setIdentity(values);
      setPendingIdentity(values);
      setLastSentAt(Date.now());
      setOtpOpen(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(mapApiError(err, t).message);
      } else {
        setFormError(t('errors.network'));
      }
    }
  });

  const onVerified = (): void => {
    setOtpOpen(false);
    navigate(from ?? '/consumer/submit', { replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('consumer.landing.title')}</CardTitle>
          <CardDescription>{t('consumer.landing.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="consumerId">{t('consumer.landing.consumerId')}</Label>
              <Input
                id="consumerId"
                autoComplete="off"
                placeholder={t('consumer.landing.consumerIdPlaceholder')}
                aria-invalid={errors.consumerId ? true : undefined}
                aria-describedby={
                  errors.consumerId ? 'consumerId-error' : 'consumerId-help'
                }
                {...register('consumerId')}
              />
              <p id="consumerId-help" className="text-xs text-[var(--color-muted-500)]">
                {t('consumer.landing.consumerIdHelp')}
              </p>
              {errors.consumerId ? (
                <p id="consumerId-error" className="text-xs text-[var(--color-danger-600)]">
                  {t('consumer.landing.consumerIdRequired')}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mobile">{t('consumer.landing.mobile')}</Label>
              <Input
                id="mobile"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t('consumer.landing.mobilePlaceholder')}
                aria-invalid={errors.mobile ? true : undefined}
                aria-describedby={errors.mobile ? 'mobile-error' : undefined}
                {...register('mobile')}
              />
              {errors.mobile ? (
                <p id="mobile-error" className="text-xs text-[var(--color-danger-600)]">
                  {t('consumer.landing.mobileInvalid')}
                </p>
              ) : null}
            </div>

            {formError ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={sendMutation.isPending}>
              {sendMutation.isPending
                ? t('consumer.landing.sending')
                : t('consumer.landing.send')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {pendingIdentity ? (
        <OtpModal
          open={otpOpen}
          consumerId={pendingIdentity.consumerId}
          mobile={pendingIdentity.mobile}
          lastSentAt={lastSentAt}
          onClose={() => setOtpOpen(false)}
          onResend={() => setLastSentAt(Date.now())}
          onVerified={onVerified}
        />
      ) : null}
    </main>
  );
}

