/**
 * Cold-start entry (`/`) — either the staff home (authenticated) or
 * the **role chooser** (anonymous). Replaces the Stage 21.3-b.2
 * "always redirect to staff-login" behaviour so consumers opening
 * the app icon can reach the complaint-submission flow without a
 * deep-link.
 *
 * Three states:
 *  - Not yet hydrated (SecureStore async) → invisible placeholder to
 *    avoid an anonymous-flash while the persisted token loads.
 *  - Hydrated + no access token → **role chooser**: two CTAs
 *    ("File a complaint" → `/(consumer)/landing`, "Staff sign in"
 *    → `/(auth)/staff-login`) plus a `<LanguageToggle>` in the
 *    header. Both routes are already implemented; the chooser only
 *    adds discoverability.
 *  - Hydrated + authenticated → tiny staff greeting + logout (v1
 *    home — dashboard proper lands later in the mobile roadmap).
 *
 * The staff-only §9.6 push-permission trigger stays gated on
 * `accessToken` so anonymous role-chooser visits don't ask for
 * notifications.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useT } from '@complaints/i18n';

import {
  useAuthStore,
  selectAccessToken,
  selectStaff,
} from '@/auth/authStore';
import { performStaffLogout } from '@/auth/staffLogout';
import { usePushRegistration } from '@/lib/usePushRegistration';
import { LanguageToggle } from '@/components/LanguageToggle';

export default function HomeScreen(): React.JSX.Element {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const accessToken = useAuthStore(selectAccessToken);
  const staff = useAuthStore(selectStaff);
  const hydrated = usePersistHydrated();
  const { runIfNeeded: runPushRegistration } = usePushRegistration('staff');

  // §9.6 staff trigger: fire the OS permission prompt + register the
  // device the FIRST time an authenticated home screen renders per
  // install. `runIfNeeded` short-circuits when `lastRegisteredDeviceId`
  // is already set (cheap re-mount case) and when the user recently
  // denied (7-day cooldown). Fire-and-forget — push failures MUST NOT
  // block the home render.
  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void runPushRegistration();
  }, [hydrated, accessToken, runPushRegistration]);

  // Wait for SecureStore rehydration before deciding what to render.
  // A cold start always sees `null` tokens on the first frame; without
  // this gate we'd briefly flash the role chooser at an authenticated
  // staff user before the persisted session catches up.
  if (!hydrated) {
    return <View style={[styles.container, styles.center]} />;
  }

  if (!accessToken) {
    return (
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <View style={styles.header}>
          <LanguageToggle />
        </View>
        <Text style={styles.chooserTitle}>{t('roleChooser.title')}</Text>
        <Text style={styles.chooserSubtitle}>{t('roleChooser.subtitle')}</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('roleChooser.consumerCta')}
          onPress={() => router.push('/(consumer)/landing')}
          style={({ pressed }) => [
            styles.card,
            styles.cardPrimary,
            pressed && styles.cardPressed,
          ]}
        >
          <Text style={styles.cardTitlePrimary}>
            {t('roleChooser.consumerCta')}
          </Text>
          <Text style={styles.cardHintPrimary}>
            {t('roleChooser.consumerHint')}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('roleChooser.staffCta')}
          onPress={() => router.push('/(auth)/staff-login')}
          style={({ pressed }) => [
            styles.card,
            styles.cardSecondary,
            pressed && styles.cardPressed,
          ]}
        >
          <Text style={styles.cardTitle}>{t('roleChooser.staffCta')}</Text>
          <Text style={styles.cardHint}>{t('roleChooser.staffHint')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 32 }]}>
      <View style={styles.header}>
        <LanguageToggle />
      </View>
      <Text style={styles.title}>
        {t('staff.dashboard.welcome', { name: staff?.fullName ?? '' })}
      </Text>
      {staff?.role ? (
        <Text style={styles.meta}>{t('staff.dashboard.role', { role: staff.role })}</Text>
      ) : null}
      <Text style={styles.body}>{t('staff.dashboard.homeBody')}</Text>

      <Pressable
        accessibilityRole="button"
        onPress={performStaffLogout}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>{t('common.logout')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Tracks whether the persisted authStore has rehydrated from SecureStore.
 * zustand exposes `useAuthStore.persist.onFinishHydration` + a synchronous
 * `useAuthStore.persist.hasHydrated()`. Sync check covers the case where
 * hydration completed before this component mounted; the subscription
 * covers the cold-start race.
 */
function usePersistHydrated(): boolean {
  const [hydrated, setHydrated] = useState<boolean>(() =>
    useAuthStore.persist.hasHydrated(),
  );
  useEffect(() => {
    if (hydrated) return;
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [hydrated]);
  return hydrated;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    gap: 8,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'flex-end', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 13, color: '#64748b' },
  body: { fontSize: 14, color: '#475569', marginTop: 12, marginBottom: 24 },
  button: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#ffffff', fontWeight: '600' },

  // Role-chooser styles
  chooserTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 12,
  },
  chooserSubtitle: {
    fontSize: 15,
    color: '#475569',
    marginTop: 6,
    marginBottom: 24,
  },
  card: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardPrimary: {
    backgroundColor: '#0f172a',
  },
  cardSecondary: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardPressed: { opacity: 0.9 },
  cardTitlePrimary: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  cardHintPrimary: {
    fontSize: 13,
    color: '#cbd5e1',
    marginTop: 6,
    lineHeight: 18,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  cardHint: { fontSize: 13, color: '#475569', marginTop: 6, lineHeight: 18 },
});

