/**
 * OTP verification modal. Sits on the landing screen and (after re-OTP)
 * on any consumer route the guard sends back here.
 *
 * State machine in one paragraph: the modal opens *after* a successful
 * `sendOtp`. The user types a 6-digit code; we call `verifyOtp`; on
 * success we commit `{token, expiresAt, consumerId, mobile}` to the
 * consumer store and bubble that up via `onVerified` (parent decides
 * the next route). A 30-second cooldown locks the "Resend" button after
 * each send — matches the BE per-mobile cooldown so the user never gets
 * an `OTP_COOLDOWN` from a hot resend.
 *
 * Errors we render distinctly (per Stage 11 prompt):
 *   - `OTP_INVALID`            — generic "wrong code" message; don't
 *                                leak the attempt counter.
 *   - `OTP_EXPIRED`            — "ask for a new OTP" (BE returns this
 *                                when the OTP row aged out before verify).
 *   - `OTP_TOO_MANY_ATTEMPTS`  — locks the input until a resend.
 *   - `OTP_COOLDOWN`           — bumps the cooldown timer.
 *   - `OTP_RATE_LIMIT`         — 5/hour cap — surface a different copy
 *                                so the user knows to wait.
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useSendConsumerOtp,
  useVerifyConsumerOtp,
  ApiError,
  type Schemas,
} from '@complaints/api';
import { useT } from '@complaints/i18n';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useConsumerAuthStore } from '@/features/consumer/consumerAuthStore';
import { mapApiError } from '@/lib/apiErrors';

const RESEND_COOLDOWN_MS = 30_000;

const otpSchema = z.object({
  otp: z
    .string()
    .min(4)
    .max(8)
    .regex(/^[0-9]+$/),
});
type OtpFormValues = z.infer<typeof otpSchema>;

export interface OtpModalProps {
  open: boolean;
  consumerId: string;
  mobile: string;
  /** Epoch-ms of the last successful `sendOtp`. Drives the cooldown timer. */
  lastSentAt: number;
  onClose: () => void;
  onResend: () => void;
  onVerified: () => void;
}

export function OtpModal({
  open,
  consumerId,
  mobile,
  lastSentAt,
  onClose,
  onResend,
  onVerified,
}: OtpModalProps): React.JSX.Element {
  const t = useT();
  const setVerified = useConsumerAuthStore((s) => s.setVerified);

  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((lastSentAt + RESEND_COOLDOWN_MS - Date.now()) / 1000)),
  );
  const [locked, setLocked] = useState(false); // OTP_TOO_MANY_ATTEMPTS

  // 1-second tick for the resend countdown. Wall-clock-driven so a tab
  // sleep doesn't strand us at "Resend in 3s".
  useEffect(() => {
    if (!open) return;
    const tick = (): void => {
      const left = Math.max(
        0,
        Math.ceil((lastSentAt + RESEND_COOLDOWN_MS - Date.now()) / 1000),
      );
      setSecondsLeft(left);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [open, lastSentAt]);

  const verifyMutation = useVerifyConsumerOtp();
  const sendMutation = useSendConsumerOtp();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '' },
  });

  // Reset form + error state on each open so a re-OTP starts clean.
  useEffect(() => {
    if (open) {
      setError(null);
      setLocked(false);
      reset({ otp: '' });
    }
  }, [open, reset]);

  const onVerify = handleSubmit(async ({ otp }) => {
    setError(null);
    try {
      const response = await verifyMutation.mutateAsync({
        data: { consumerId, mobile, otp },
      });
      const envelope = (response as {
        data: Schemas.ApiResponseOtpVerifyResponse;
      }).data;
      const payload = envelope.data;
      if (!payload?.verificationToken || !payload.expiresAt) {
        setError(t('errors.generic'));
        return;
      }
      setVerified({
        token: payload.verificationToken,
        expiresAt: payload.expiresAt,
        consumerId,
        mobile,
      });
      onVerified();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'OTP_TOO_MANY_ATTEMPTS') setLocked(true);
        setError(mapApiError(err, t).message);
      } else {
        setError(t('errors.network'));
      }
    }
  });

  const onResendClick = async (): Promise<void> => {
    setError(null);
    try {
      await sendMutation.mutateAsync({ data: { consumerId, mobile } });
      onResend();
      reset({ otp: '' });
      setLocked(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(mapApiError(err, t).message);
      } else {
        setError(t('errors.network'));
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('consumer.otp.title')}
      description={t('consumer.otp.intro', { mobile })}
    >
      <form className="flex flex-col gap-4" onSubmit={onVerify} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="otp">{t('consumer.otp.label')}</Label>
          <Input
            id="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            disabled={locked}
            placeholder={t('consumer.otp.placeholder')}
            aria-invalid={errors.otp ? true : undefined}
            aria-describedby={errors.otp ? 'otp-error' : undefined}
            {...register('otp')}
          />
          {errors.otp ? (
            <p id="otp-error" className="text-xs text-[var(--color-danger-600)]">
              {t('consumer.otp.invalid')}
            </p>
          ) : null}
        </div>

        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onResendClick}
            disabled={secondsLeft > 0 || sendMutation.isPending}
          >
            {secondsLeft > 0
              ? t('consumer.otp.resendIn', { seconds: secondsLeft })
              : t('consumer.otp.resend')}
          </Button>
          <Button type="submit" disabled={locked || verifyMutation.isPending}>
            {verifyMutation.isPending
              ? t('consumer.otp.verifying')
              : t('consumer.otp.verify')}
          </Button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="self-center text-xs text-[var(--color-muted-500)] underline hover:text-[var(--color-muted-900)]"
        >
          {t('consumer.otp.startOver')}
        </button>
      </form>
    </Dialog>
  );
}

