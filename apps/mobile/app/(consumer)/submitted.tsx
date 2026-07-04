/**
 * `/(consumer)/submitted` — post-submit confirmation.
 *
 * Reads `ticketNo`, `submittedAt`, `slaDeadline` from route params
 * (populated by `submit.tsx`'s `router.replace` on success). No follow-up
 * network call — mirrors web's `<Route path="/consumer/submitted/:ticketNo">`
 * approach where the submit response payload is passed through in
 * navigation state and the confirmation renders directly from it.
 *
 * Deliberately narrower than web's ConfirmationScreen:
 *  - No "share" / "copy" (native share sheet + expo-clipboard land in
 *    b.3-c or later — YAGNI until users ask).
 *  - No status-refresh button — polling on a just-submitted ticket
 *    doesn't tell the user anything new for at least a minute.
 *  - No "view all my complaints" — the consumer tracking screen lands
 *    in a later stage.
 * The two things that matter — the ticket number and the SLA deadline —
 * are here.
 *
 * Datetimes are formatted via `formatIstDateTime` per the hard rule;
 * no `toLocaleString()` without an explicit `timeZone`.
 */
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useT } from '@complaints/i18n';
import { formatIstDateTime } from '@complaints/utils';

import { useConsumerAuthStore } from '@/auth/consumerAuthStore';

export default function ConsumerSubmittedScreen(): React.JSX.Element {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const clearConsumer = useConsumerAuthStore((s) => s.clear);
  const params = useLocalSearchParams<{
    ticketNo?: string;
    submittedAt?: string;
    slaDeadline?: string;
  }>();

  if (!params.ticketNo) {
    // Deep-linked / refreshed with no ticket in params. There is no BE
    // endpoint to recover from a bare ticket number without also having
    // the consumer JWT (which may itself have expired). Simplest recovery:
    // send them back to landing.
    return <Redirect href="/(consumer)/landing" />;
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 24 },
      ]}
    >
      <Text style={styles.title}>{t('consumer.confirmation.title')}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>{t('consumer.confirmation.ticketLabel')}</Text>
        <Text
          accessibilityLabel={t('consumer.confirmation.ticketLabel')}
          style={styles.ticket}
        >
          {params.ticketNo}
        </Text>
      </View>

      {params.submittedAt ? (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>
            {t('consumer.confirmation.submittedAt')}
          </Text>
          <Text style={styles.rowValue}>
            {formatIstDateTime(params.submittedAt)}
          </Text>
        </View>
      ) : null}

      {params.slaDeadline ? (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>
            {t('consumer.confirmation.slaDeadline')}
          </Text>
          <Text style={styles.rowValue}>
            {formatIstDateTime(params.slaDeadline)}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          clearConsumer();
          router.replace('/(consumer)/landing');
        }}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>
          {t('consumer.confirmation.startOver')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 14,
    backgroundColor: '#ffffff',
    flexGrow: 1,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  card: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 6,
    marginTop: 8,
  },
  label: { fontSize: 12, color: '#166534', fontWeight: '600' },
  ticket: {
    fontSize: 24,
    color: '#052e16',
    fontWeight: '700',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 8,
  },
  rowLabel: { color: '#64748b', fontSize: 13 },
  rowValue: { color: '#0f172a', fontSize: 13, fontWeight: '600' },
  button: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
});

