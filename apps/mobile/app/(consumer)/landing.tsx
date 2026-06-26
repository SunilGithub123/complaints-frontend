/**
 * Consumer landing screen (mobile).
 *
 * Twin of `apps/web/src/screens/consumer/LandingScreen.tsx`. Single
 * form: Consumer ID + Mobile. On submit, fires `useSendConsumerOtp` and
 * (on 200) records the identity in `consumerAuthStore` and navigates to
 * the OTP route. Unlike web — which opens an `OtpModal` overlay — mobile
 * routes to a full-screen OTP page (idiomatic mobile pattern, lets the
 * OS back-gesture work as a "use a different Consumer ID" affordance).
 *
 * Already-verified shortcut: if the consumer store still holds a valid
 * (non-expired) verification token, we surface a "Resume" button rather
 * than auto-navigating, so the user understands why they didn't see the
 * OTP step (less spooky — same web behaviour).
 */
import { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSendConsumerOtp, ApiError } from '@complaints/api';
import { useT } from '@complaints/i18n';

import {
  useConsumerAuthStore,
  selectIsVerified,
} from '@/auth/consumerAuthStore';

const landingSchema = z.object({
  consumerId: z.string().min(1).max(50),
  mobile: z
    .string()
    .min(1)
    .regex(/^\+?[0-9]{7,15}$/),
});
type LandingValues = z.infer<typeof landingSchema>;

export default function ConsumerLandingScreen(): React.JSX.Element {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const setIdentity = useConsumerAuthStore((s) => s.setIdentity);
  const isVerified = useConsumerAuthStore(selectIsVerified);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LandingValues>({
    resolver: zodResolver(landingSchema),
    defaultValues: { consumerId: '', mobile: '' },
  });

  const sendMutation = useSendConsumerOtp();

  if (isVerified) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.title}>{t('consumer.landing.title')}</Text>
        <View style={styles.info} accessibilityRole="alert">
          <Text style={styles.infoText}>{t('consumer.confirmation.title')}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/(consumer)/submit')}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>{t('consumer.otp.verify')}</Text>
        </Pressable>
      </View>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await sendMutation.mutateAsync({ data: values });
      setIdentity(values);
      router.push('/(consumer)/otp');
    } catch (err) {
      if (err instanceof ApiError) {
        // Per Stage 11 BE contract: send-OTP errors collapse to "couldn't
        // send" copy. Specific codes (OTP_COOLDOWN, OTP_RATE_LIMIT,
        // CONSUMER_NOT_FOUND) get their own copy in 21.3-b.3-b once
        // the mobile `mapApiError` helper lands — for now fall back to
        // the generic message so we don't ship half-translated copy.
        setFormError(t('errors.generic'));
      } else {
        setFormError(t('errors.network'));
      }
    }
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.title}>{t('consumer.landing.title')}</Text>
        <Text style={styles.subtitle}>{t('consumer.landing.subtitle')}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('consumer.landing.consumerId')}</Text>
          <Controller
            control={control}
            name="consumerId"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                accessibilityLabel={t('consumer.landing.consumerId')}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={t('consumer.landing.consumerIdPlaceholder')}
                placeholderTextColor="#94a3b8"
                style={[styles.input, errors.consumerId ? styles.inputError : null]}
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />
          <Text style={styles.help}>{t('consumer.landing.consumerIdHelp')}</Text>
          {errors.consumerId ? (
            <Text style={styles.errorText}>
              {t('consumer.landing.consumerIdRequired')}
            </Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('consumer.landing.mobile')}</Text>
          <Controller
            control={control}
            name="mobile"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                accessibilityLabel={t('consumer.landing.mobile')}
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="tel"
                keyboardType="phone-pad"
                placeholder={t('consumer.landing.mobilePlaceholder')}
                placeholderTextColor="#94a3b8"
                style={[styles.input, errors.mobile ? styles.inputError : null]}
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />
          {errors.mobile ? (
            <Text style={styles.errorText}>{t('consumer.landing.mobileInvalid')}</Text>
          ) : null}
        </View>

        {formError ? (
          <View accessibilityRole="alert" style={styles.alert}>
            <Text style={styles.alertText}>{formError}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            busy: sendMutation.isPending,
            disabled: sendMutation.isPending,
          }}
          disabled={sendMutation.isPending}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.button,
            (pressed || sendMutation.isPending) && styles.buttonPressed,
          ]}
        >
          {sendMutation.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>{t('consumer.landing.send')}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#ffffff' },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 14,
    backgroundColor: '#ffffff',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#475569', marginBottom: 8 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155' },
  help: { fontSize: 12, color: '#64748b' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  inputError: { borderColor: '#dc2626' },
  errorText: { fontSize: 12, color: '#dc2626' },
  info: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  infoText: { color: '#1e3a8a', fontSize: 13 },
  alert: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  alertText: { color: '#991b1b', fontSize: 13 },
  button: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
});

