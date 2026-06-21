/**
 * Maps backend `ApiError.code` strings to localized messages via the
 * `errors.<code>` key in `@complaints/i18n`. Falls back to the BE
 * `message` (already localized server-side for most codes) or a generic
 * string.
 *
 * Centralised so screens don't grow `if (code === 'X') t('errors.x')`
 * ladders. Add new error codes to `packages/i18n/src/locales/{en,mr}.json`
 * under `errors.<code>` and they Just Work.
 */
import { ApiError } from '@complaints/api';
import type { TFunction } from 'i18next';

export interface MappedError {
  code: string | null;
  message: string;
  /** Per-field errors when the BE returned a `VALIDATION_FAILED` envelope. */
  fieldErrors?: Record<string, string>;
}

export function mapApiError(err: unknown, t: TFunction): MappedError {
  if (err instanceof ApiError) {
    const code = err.code;
    const key = `errors.${code}`;
    const localized = t(key);
    const usable = localized !== key && localized.length > 0;
    return {
      code,
      message: usable ? localized : err.message || t('errors.generic'),
      ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
    };
  }
  return { code: null, message: t('errors.network') };
}

