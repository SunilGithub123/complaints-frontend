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

function readPersistedLocale(): SupportedLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'mr' || v === 'en' ? v : DEFAULT_LOCALE;
}

let initialised = false;

/** Initialise the i18next singleton. Idempotent — safe to call from tests. */
export function initI18n(locale: SupportedLocale = readPersistedLocale()): I18n {
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

export function setLocale(locale: SupportedLocale): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, locale);
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

