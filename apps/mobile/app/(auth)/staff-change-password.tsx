/**
 * First-login change-password screen (mobile).
 *
 * Mobile twin of `apps/web/src/screens/change-password/ChangePasswordScreen.tsx`.
 * Same BE contract: complexity regex mirrors `ChangePasswordRequest` so
 * the user gets inline feedback instead of a round-trip 400. On success
 * the BE returns a rotated session triple (Stage 1 post-hotfix);
 * we just write it and route to home.
 *
 * NOTE: unlike web there is no `?from=profile` deep-link return — the
 * profile screen doesn't exist on mobile yet (Phase 4 carry-over).
 * Always route home on success here.
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
import { useChangeStaffPassword, ApiError, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';

import { useAuthStore } from '@/auth/authStore';

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

export default function StaffChangePasswordScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
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
      const response = await mutateAsync({
        data: {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        },
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
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message || t('errors.generic'));
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
        <Text style={styles.title}>{t('staff.changePassword.title')}</Text>
        <Text style={styles.subtitle}>{t('staff.changePassword.subtitle')}</Text>

        <PasswordField
          control={control}
          name="currentPassword"
          label={t('staff.changePassword.currentPassword')}
          autoComplete="current-password"
          error={undefined}
        />

        <PasswordField
          control={control}
          name="newPassword"
          label={t('staff.changePassword.newPassword')}
          autoComplete="new-password"
          error={errors.newPassword?.message}
        />

        <PasswordField
          control={control}
          name="confirmPassword"
          label={t('staff.changePassword.confirmPassword')}
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
        />

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
            <Text style={styles.buttonText}>{t('staff.changePassword.submit')}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// Tiny local helper — three near-identical password inputs in one
// screen earns a one-screen-scoped helper (the "third use" rule, all
// inside this file). NOT promoted to a shared component yet.
import type { Control, FieldPath } from 'react-hook-form';
import type { TextInputProps } from 'react-native';

type Fields = ChangePasswordValues;

interface PasswordFieldProps {
  control: Control<Fields>;
  name: FieldPath<Fields>;
  label: string;
  autoComplete: TextInputProps['autoComplete'];
  error: string | undefined;
}

function PasswordField({
  control,
  name,
  label,
  autoComplete,
  error,
}: PasswordFieldProps): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            accessibilityLabel={label}
            autoCapitalize="none"
            autoComplete={autoComplete}
            autoCorrect={false}
            secureTextEntry
            style={[styles.input, error ? styles.inputError : null]}
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
          />
        )}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#ffffff' },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
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

