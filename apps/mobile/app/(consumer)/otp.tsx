/**
 * OTP verification screen (mobile).
 *
 * Mobile twin of `apps/web/src/screens/consumer/OtpModal.tsx`. Two
 * deltas vs the web overlay:
 *
 *  - **Full-screen**, not a modal. The OS back-gesture takes the user
 *    back to the landing screen, which doubles as the "use a different
 *    Consumer ID" affordance.
 *  - **Identity comes from the store**, not props. The landing screen
 *    calls `setIdentity` before navigating here; we read it back via
 *    `consumerAuthStore`. If the store has no identity (e.g. the user
 *    deep-linked or refreshed), we bounce back to landing.
 *
 * State machine in one paragraph: mount → 30 s resend cooldown ticking;
 * user types the code → `useVerifyConsumerOtp` → on success commit
 * `{token, expiresAt, consumerId, mobile}` to the consumer store and
 * `router.replace` to submit; on `OTP_TOO_MANY_ATTEMPTS` lock the
 * input until a resend; on other ApiErrors surface a generic message
 * (per-code copy lands with the mobile `mapApiError` helper in b.3-b).
 */
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useSendConsumerOtp,
  useVerifyConsumerOtp,
  ApiError,
  type Schemas,
} from '@complaints/api';
import { useT } from '@complaints/i18n';

import { useConsumerAuthStore } from '@/auth/consumerAuthStore';
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

export default function ConsumerOtpScreen(): React.JSX.Element {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const consumerId = useConsumerAuthStore((s) => s.consumerId);
  const mobile = useConsumerAuthStore((s) => s.mobile);
  const setVerified = useConsumerAuthStore((s) => s.setVerified);

  // No identity → user got here without going through landing. Bounce
  // back; landing's already-verified shortcut handles the converse case.
  if (!consumerId || !mobile) {
    return <Redirect href="/(consumer)/landing" />;
  }

  return (
    <OtpForm
      t={t}
      insets={insets}
      router={router}
      consumerId={consumerId}
      mobile={mobile}
      setVerified={setVerified}
    />
  );
}

// Form lives in a sub-component so the hooks below are only reached after
// the `consumerId`/`mobile` null-check. Keeps the early-redirect path
// hook-free.

interface OtpFormProps {
  t: ReturnType<typeof useT>;
  insets: { top: number };
  router: ReturnType<typeof useRouter>;
  consumerId: string;
  mobile: string;
  setVerified: (input: {
    token: string;
    expiresAt: string;
    consumerId: string;
    mobile: string;
  }) => void;
}

function OtpForm({
  t,
  insets,
  router,
  consumerId,
  mobile,
  setVerified,
}: OtpFormProps): React.JSX.Element {
  // Cooldown starts at mount (landing screen just sent an OTP; the
  // <300 ms between sendOtp success and OTP mount is well under the
  // BE per-mobile cooldown window).
  const [sentAt, setSentAt] = useState<number>(() => Date.now());
  const [secondsLeft, setSecondsLeft] = useState<number>(30);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifyMutation = useVerifyConsumerOtp();
  const sendMutation = useSendConsumerOtp();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '' },
  });

  // 1-second tick for the resend countdown. Wall-clock-driven so an
  // app-background / suspend doesn't strand us at "Resend in 3s".
  useEffect(() => {
    const tick = (): void => {
      const left = Math.max(
        0,
        Math.ceil((sentAt + RESEND_COOLDOWN_MS - Date.now()) / 1000),
      );
      setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sentAt]);

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
      router.replace('/(consumer)/submit');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'OTP_TOO_MANY_ATTEMPTS') setLocked(true);
        setError(mapApiError(err, t).message);
      } else {
        setError(t('errors.network'));
      }
    }
  });

  const onResend = async (): Promise<void> => {
    setError(null);
    try {
      await sendMutation.mutateAsync({ data: { consumerId, mobile } });
      setSentAt(Date.now());
      setLocked(false);
      reset({ otp: '' });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(mapApiError(err, t).message);
      } else {
        setError(t('errors.network'));
      }
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.title}>{t('consumer.otp.title')}</Text>
        <Text style={styles.subtitle}>{t('consumer.otp.intro', { mobile })}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('consumer.otp.label')}</Text>
          <Controller
            control={control}
            name="otp"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                accessibilityLabel={t('consumer.otp.label')}
                autoCapitalize="none"
                autoComplete="one-time-code"
                autoCorrect={false}
                editable={!locked}
                inputMode="numeric"
                keyboardType="number-pad"
                maxLength={8}
                placeholder={t('consumer.otp.placeholder')}
                placeholderTextColor="#94a3b8"
                style={[
                  styles.input,
                  errors.otp ? styles.inputError : null,
                  locked && styles.inputDisabled,
                ]}
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />
          {errors.otp ? (
            <Text style={styles.errorText}>{t('consumer.otp.invalid')}</Text>
          ) : null}
        </View>

        {error ? (
          <View accessibilityRole="alert" style={styles.alert}>
            <Text style={styles.alertText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled: secondsLeft > 0 || sendMutation.isPending,
            }}
            disabled={secondsLeft > 0 || sendMutation.isPending}
            onPress={onResend}
            style={({ pressed }) => [
              styles.secondaryButton,
              (pressed || secondsLeft > 0 || sendMutation.isPending) &&
                styles.secondaryButtonDisabled,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              {secondsLeft > 0
                ? t('consumer.otp.resendIn', { seconds: secondsLeft })
                : t('consumer.otp.resend')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              busy: verifyMutation.isPending,
              disabled: locked || verifyMutation.isPending,
            }}
            disabled={locked || verifyMutation.isPending}
            onPress={onVerify}
            style={({ pressed }) => [
              styles.button,
              (pressed || verifyMutation.isPending || locked) && styles.buttonPressed,
            ]}
          >
            {verifyMutation.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>{t('consumer.otp.verify')}</Text>
            )}
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/(consumer)/landing')}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>{t('consumer.otp.startOver')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#ffffff' },
  container: { flex: 1, paddingHorizontal: 24, gap: 14, backgroundColor: '#ffffff' },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#475569', marginBottom: 8 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    letterSpacing: 4,
    color: '#0f172a',
  },
  inputError: { borderColor: '#dc2626' },
  inputDisabled: { backgroundColor: '#f1f5f9', color: '#94a3b8' },
  errorText: { fontSize: 12, color: '#dc2626' },
  alert: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  alertText: { color: '#991b1b', fontSize: 13 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  button: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
  secondaryButton: {
    flex: 1,
    borderColor: '#0f172a',
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonDisabled: { opacity: 0.5 },
  secondaryButtonText: { color: '#0f172a', fontWeight: '600', fontSize: 14 },
  linkButton: { alignItems: 'center', marginTop: 12 },
  linkText: { color: '#64748b', textDecorationLine: 'underline', fontSize: 13 },
});

