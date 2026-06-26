/**
 * Mobile-side i18n bootstrap. Plugs `AsyncStorage` into
 * `@complaints/i18n`'s pluggable adapter so:
 *
 *  - `setLocale(...)` from any future locale-switcher UI persists.
 *  - On cold boot, the user's last-selected locale is re-applied
 *    after one frame (init starts in English, `loadPersistedLocale`
 *    swaps on the next tick).
 *
 * Web uses the package's built-in `localStorage` adapter automatically —
 * no equivalent file there. Keep this binding out of the i18n package
 * itself: the package must stay framework-free so it ships to Node
 * tests, web, and mobile from the same build.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureLocaleStorage, loadPersistedLocale } from '@complaints/i18n';

export function wireI18n(): void {
  configureLocaleStorage({
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
  });
  // Fire-and-forget — the worst case is one frame of English flicker
  // before the saved locale loads. Acceptable; the alternative (blocking
  // the splash on an async read) is worse.
  void loadPersistedLocale().catch(() => undefined);
}

