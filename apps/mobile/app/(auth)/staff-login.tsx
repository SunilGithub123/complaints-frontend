/**
 * Staff login screen (mobile).
 *
 * Mobile twin of `apps/web/src/screens/login/LoginScreen.tsx`. Same
 * BE contract (`POST /staff/auth/login` — Stage 1), same generated
 * `useLoginStaff` mutation, same BRD §4.1 rule: generic error message
 * on any credential failure (do NOT disclose whether the employeeId
 * exists).
 *
 * UI is `StyleSheet`-only per copilot-instructions.md §11 — no Tailwind
 * on mobile. Tokens currently inline (the `@complaints/ui-tokens`
 * package is still a placeholder; centralisation happens once 3+
 * mobile screens share the same values, per the "third use" rule).
 *
 * A11y: every `TextInput` gets `accessibilityLabel`; the submit button
 * is a `Pressable` with `accessibilityRole="button"` + an
 * `accessibilityState` reflecting the busy flag. That's the RN
 * equivalent of web's `aria-*`.
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
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLoginStaff, ApiError, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';

import { useAuthStore } from '@/auth/authStore';

const loginSchema = z.object({
  employeeId: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
});
type LoginFormValues = z.infer<typeof loginSchema>;

export default function StaffLoginScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { employeeId: '', password: '' },
  });

  const { mutateAsync, isPending } = useLoginStaff();

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const response = await mutateAsync({ data: values });
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
      router.replace(
        payload.staff.passwordResetRequired ? '/(auth)/staff-change-password' : '/',
      );
    } catch (err) {
      // Same mapping as web LoginScreen: BAD_CREDENTIALS + any other 4xx
      // collapse to the generic credential message (BRD §4.1); 5xx and
      // transport failures get their own copy.
      if (err instanceof ApiError && err.status >= 500) {
        setFormError(t('errors.generic'));
      } else if (err instanceof ApiError) {
        setFormError(t('errors.badCredentials'));
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
      <View style={styles.container}>
        <Text style={styles.title}>{t('staff.login.title')}</Text>
        <Text style={styles.subtitle}>{t('staff.login.subtitle')}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('staff.login.employeeId')}</Text>
          <Controller
            control={control}
            name="employeeId"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                accessibilityLabel={t('staff.login.employeeId')}
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect={false}
                placeholder={t('staff.login.employeeIdPlaceholder')}
                placeholderTextColor="#94a3b8"
                style={[styles.input, errors.employeeId ? styles.inputError : null]}
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />
          {errors.employeeId ? (
            <Text style={styles.errorText}>{t('staff.login.employeeIdRequired')}</Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('staff.login.password')}</Text>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                accessibilityLabel={t('staff.login.password')}
                autoCapitalize="none"
                autoComplete="current-password"
                autoCorrect={false}
                placeholder={t('staff.login.passwordPlaceholder')}
                placeholderTextColor="#94a3b8"
                secureTextEntry
                style={[styles.input, errors.password ? styles.inputError : null]}
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />
          {errors.password ? (
            <Text style={styles.errorText}>{t('staff.login.passwordRequired')}</Text>
          ) : null}
        </View>

        {formError ? (
          <View accessibilityRole="alert" style={styles.alert}>
            <Text style={styles.alertText}>{formError}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: isPending, disabled: isPending }}
          disabled={isPending}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.button,
            (pressed || isPending) && styles.buttonPressed,
          ]}
        >
          {isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>{t('staff.login.submit')}</Text>
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
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#475569', marginBottom: 12 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155' },
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

