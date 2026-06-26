/**
 * Authenticated mobile home — replaces the Stage 21.3-a smoke screen.
 *
 * Two states:
 *  - No access token (and not still rehydrating) → `<Redirect>` to
 *    `/(auth)/staff-login`. Subscribing to `accessToken` via the zustand
 *    selector means the redirect re-fires automatically the moment
 *    `onUnauthenticated` clears the store (the transport's 401 path).
 *  - Authenticated → tiny greeting + logout button. This is NOT the
 *    real staff dashboard (no master-data, no complaints) — that lands
 *    later in the mobile roadmap. The point at 21.3-b.2 is to make the
 *    staff login loop end-to-end testable.
 *
 * Consumer flow has its own landing route (lands in 21.3-b.3); for
 * now this screen only handles the staff side.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { useT } from '@complaints/i18n';

import {
  useAuthStore,
  selectAccessToken,
  selectStaff,
} from '@/auth/authStore';

export default function HomeScreen(): React.JSX.Element {
  const t = useT();
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore(selectAccessToken);
  const staff = useAuthStore(selectStaff);
  const clear = useAuthStore((s) => s.clear);
  const hydrated = usePersistHydrated();

  // Wait for SecureStore rehydration before deciding to redirect — the
  // first render after a cold start always sees `null` tokens even when
  // a valid session is on disk. Without this gate we'd briefly bounce
  // an authenticated user back to the login screen.
  if (!hydrated) {
    return <View style={[styles.container, styles.center]} />;
  }

  if (!accessToken) {
    return <Redirect href="/(auth)/staff-login" />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 32 }]}>
      <Text style={styles.title}>
        {t('staff.dashboard.welcome', { name: staff?.fullName ?? '' })}
      </Text>
      {staff?.role ? (
        <Text style={styles.meta}>{t('staff.dashboard.role', { role: staff.role })}</Text>
      ) : null}
      <Text style={styles.body}>{t('staff.dashboard.homeBody')}</Text>

      <Pressable
        accessibilityRole="button"
        onPress={clear}
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
});

