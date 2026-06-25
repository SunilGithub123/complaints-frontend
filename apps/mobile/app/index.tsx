/**
 * Stage 21.3-a smoke screen.
 *
 * Proves the dep chain end-to-end: TypeScript strict + workspace packages
 * (`@complaints/i18n`, `@complaints/utils`) + expo-router resolution +
 * Metro monorepo config + SafeArea wiring all light up before we add any
 * real flows. Replace this with the consumer landing route in 21.3-b.
 */
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@complaints/i18n';
import { IST_TIMEZONE, formatIstDateTime } from '@complaints/utils';

export default function HelloScreen(): React.JSX.Element {
  const t = useT();
  const insets = useSafeAreaInsets();
  const now = formatIstDateTime(new Date().toISOString());

  return (
    <View style={[styles.container, { paddingTop: insets.top + 32 }]}>
      <Text style={styles.title}>Complaints CRS — mobile</Text>
      <Text style={styles.body}>
        Shell is alive. Stage 21.3-a complete.
      </Text>
      <Text style={styles.meta}>
        i18n: {t('common.loading')} · TZ: {IST_TIMEZONE}
      </Text>
      <Text style={styles.meta}>Now (IST): {now}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    color: '#0f172a',
  },
  body: {
    fontSize: 16,
    marginBottom: 24,
    color: '#475569',
    textAlign: 'center',
  },
  meta: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 4,
  },
});

