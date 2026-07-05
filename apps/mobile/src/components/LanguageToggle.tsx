/**
 * `LanguageToggle` — tiny two-state button that flips between English
 * and Marathi. Placed on the mobile role chooser (unauthenticated
 * entry) and staff home so a user can switch language from either
 * side of the auth boundary.
 *
 * Why a toggle rather than a picker? v1 has exactly two languages
 * (§SUPPORTED_LOCALES). YAGNI on a Modal-based picker; add one when a
 * third locale lands. The button label reads "मराठी" while English is
 * active and "English" while Marathi is active — always the target
 * language, matching Google's own switcher convention.
 *
 * a11y: `accessibilityRole="button"` + `accessibilityLabel` that
 * spells out the switch action ("Switch to मराठी") so screen readers
 * announce intent, not just the target-language noun.
 */
import { Pressable, Text, StyleSheet } from 'react-native';
import { useT, useCurrentLocale } from '@complaints/i18n';

export function LanguageToggle(): React.JSX.Element {
  const t = useT();
  const [locale, setLocale] = useCurrentLocale();
  const nextLocale = locale === 'en' ? 'mr' : 'en';
  const nextLabel =
    nextLocale === 'en' ? t('common.language.english') : t('common.language.marathi');
  const a11yLabel = t('common.language.switchTo', { name: nextLabel });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={() => setLocale(nextLocale)}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.text}>{nextLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignSelf: 'flex-end',
  },
  pressed: { opacity: 0.8 },
  text: { fontSize: 13, color: '#0f172a', fontWeight: '500' },
});

