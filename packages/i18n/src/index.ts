/**
 * `@complaints/i18n` — i18next singleton + locale catalogues.
 *
 * The English catalogue is the source-of-truth for key names. The Marathi
 * catalogue must mirror its key tree (CI guard for parity comes in Phase 7).
 *
 * Consumers do:
 *   import { initI18n, useT, type SupportedLocale } from '@complaints/i18n';
 *   initI18n(); // once at app boot
 *
 * On platforms where `localStorage` does not exist (React Native), call
 * `configureLocaleStorage` once at boot with an async adapter
 * (`AsyncStorage`) and then `loadPersistedLocale()` to apply the stored
 * choice. See `apps/mobile/src/lib/wireI18n.ts` for the mobile binding.
 *
 * Backend `ErrorCode` strings map to the `errors.*` key namespace — see
 * ../../../complaints/src/main/java/com/example/complaints/common/exception/ErrorCode.java.
 */
import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import en from './locales/en.json';
import mr from './locales/mr.json';

export type SupportedLocale = 'en' | 'mr';
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['en', 'mr'] as const;
export const DEFAULT_LOCALE: SupportedLocale = 'en';

const STORAGE_KEY = 'complaints:locale';

/**
 * Pluggable storage adapter. Both methods may return sync or async; we
 * always `await` the result. Web uses an internal `localStorage` adapter;
 * mobile injects an `AsyncStorage`-backed one via `configureLocaleStorage`.
 */
export interface LocaleStorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

let storageAdapter: LocaleStorageAdapter | null = null;

/** Inject an async storage adapter. Call once at boot before `setLocale`. */
export function configureLocaleStorage(adapter: LocaleStorageAdapter): void {
  storageAdapter = adapter;
}

function webLocalStorageAdapter(): LocaleStorageAdapter | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  return {
    getItem: (k) => {
      try {
        return window.localStorage.getItem(k);
      } catch {
        // Safari private mode throws here — treat as "no preference".
        return null;
      }
    },
    setItem: (k, v) => {
      try {
        window.localStorage.setItem(k, v);
      } catch {
        // Quota / private-mode — locale change is best-effort.
      }
    },
  };
}

function activeAdapter(): LocaleStorageAdapter | null {
  return storageAdapter ?? webLocalStorageAdapter();
}

function readPersistedLocaleSync(): SupportedLocale {
  // Sync fast-path for `initI18n` defaults. Only sees a value if the
  // active adapter happens to be synchronous (i.e. the web localStorage
  // adapter). Mobile callers should pass `DEFAULT_LOCALE` to `initI18n`
  // and then call `loadPersistedLocale()` to switch async.
  const a = activeAdapter();
  if (!a) return DEFAULT_LOCALE;
  const v = a.getItem(STORAGE_KEY);
  if (typeof v === 'string') return v === 'mr' || v === 'en' ? v : DEFAULT_LOCALE;
  return DEFAULT_LOCALE;
}

let initialised = false;

/** Initialise the i18next singleton. Idempotent — safe to call from tests. */
export function initI18n(locale: SupportedLocale = readPersistedLocaleSync()): I18n {
  if (!initialised) {
    void i18next.use(initReactI18next).init({
      resources: {
        en: { translation: en },
        mr: { translation: mr },
      },
      lng: locale,
      fallbackLng: DEFAULT_LOCALE,
      interpolation: { escapeValue: false },
      returnNull: false,
    });
    initialised = true;
  } else if (i18next.language !== locale) {
    void i18next.changeLanguage(locale);
  }
  return i18next;
}

/**
 * Read the persisted locale (async) and apply it if different from the
 * current language. Use this on mobile right after `initI18n()` — the
 * sync boot defaults to English, then this swaps to the saved choice
 * on the next frame.
 *
 * Returns the locale that ended up active.
 */
export async function loadPersistedLocale(): Promise<SupportedLocale> {
  const a = activeAdapter();
  if (!a) return (i18next.language as SupportedLocale) ?? DEFAULT_LOCALE;
  const raw = await a.getItem(STORAGE_KEY);
  const locale: SupportedLocale = raw === 'mr' || raw === 'en' ? raw : DEFAULT_LOCALE;
  if (i18next.language !== locale) await i18next.changeLanguage(locale);
  return locale;
}

/** User-facing locale switcher. Persists via the active adapter (fire-and-forget). */
export function setLocale(locale: SupportedLocale): void {
  const a = activeAdapter();
  if (a) void Promise.resolve(a.setItem(STORAGE_KEY, locale)).catch(() => undefined);
  void i18next.changeLanguage(locale);
}

/**
 * Thin re-export of react-i18next's hook. Components should call this rather
 * than depending on `react-i18next` directly so the package boundary stays
 * stable if we ever swap the underlying engine.
 */
export function useT(): ReturnType<typeof useTranslation>['t'] {
  return useTranslation().t;
}

export { i18next };

