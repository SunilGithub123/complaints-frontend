/**
 * Consumer submit — **placeholder** for Stage 21.3-b.3-a.
 *
 * The real submit form (category dropdown, description, optional photos
 * via `expo-image-picker` + `expo-image-manipulator`, draft persistence)
 * lands in Stage 21.3-b.3-b. Shipping this stub now keeps the
 * landing → OTP → submit route chain navigable end-to-end so we can
 * exercise the OTP loop against the dev backend without a half-rendered
 * route.
 *
 * Guards:
 *   - Not verified → bounce back to landing (landing's already-verified
 *     shortcut handles the converse case).
 *   - Verified → show the wait copy + a "start over" / "clear session"
 *     affordance so manual QA doesn't need a process kill to reset.
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { useT } from '@complaints/i18n';

import {
  useConsumerAuthStore,
  selectIsVerified,
  selectMinutesRemaining,
} from '@/auth/consumerAuthStore';

export default function ConsumerSubmitPlaceholderScreen(): React.JSX.Element {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isVerified = useConsumerAuthStore(selectIsVerified);
  const minutesLeft = useConsumerAuthStore(selectMinutesRemaining);
  const clear = useConsumerAuthStore((s) => s.clear);

  if (!isVerified) {
    return <Redirect href="/(consumer)/landing" />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.title}>{t('consumer.submit.title')}</Text>
      <Text style={styles.meta}>
        {t('consumer.submit.tokenExpiresIn', { minutes: minutesLeft })}
      </Text>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Submit form lands in 21.3-b.3-b</Text>
        <Text style={styles.noticeBody}>
          The OTP loop is wired end-to-end. The category dropdown,
          description field, and photo capture pipeline are tracked
          separately so we can land them with their own jest-expo test
          batch. See docs/IMPLEMENTATION_LOG.md → Stage 21.3-b.3-a.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          clear();
          router.replace('/(consumer)/landing');
        }}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>{t('consumer.otp.startOver')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 13, color: '#64748b', marginBottom: 8 },
  notice: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 6,
  },
  noticeTitle: { color: '#854d0e', fontWeight: '700', fontSize: 14 },
  noticeBody: { color: '#854d0e', fontSize: 13, lineHeight: 18 },
  button: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#ffffff', fontWeight: '600' },
});

