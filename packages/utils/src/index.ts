/**
 * IST timezone constant — must be used by every business date helper.
 * Mirrors backend `DateUtils.IST` (see ../../../complaints/docs/TECHNICAL_DESIGN.md §16.1).
 */
export const IST_TIMEZONE = 'Asia/Kolkata';

/** Format an ISO timestamp in IST (en-IN locale). Real formatters land per-feature. */
export function formatIstDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { timeZone: IST_TIMEZONE });
}

/**
 * localStorage key for the per-install device UUID (web side).
 * Contract: STAGE_21_DEVICE_TOKEN_CONTRACT.md §2.3 + §9 (additional confirmations).
 */
export const DEVICE_ID_STORAGE_KEY = 'crs.deviceId';

let cachedDeviceId: string | undefined;

/**
 * Return a stable per-install `deviceId` UUID for the web client.
 *
 * - First call: generates a v4 UUID via `crypto.randomUUID()`, persists under
 *   `localStorage['crs.deviceId']`, and caches it in module scope.
 * - Subsequent calls: returns the persisted value.
 * - Safari private mode / disabled storage / SSR: falls back to an in-memory
 *   UUID for the current session only. A fresh UUID just creates a new
 *   device_token row server-side; the old one ages out via the nightly sweep
 *   (per contract §9 additional confirmations).
 *
 * The mobile app will use `expo-secure-store` under the same key and expose
 * the same function name from a platform-specific entry — call sites in
 * `apps/web` import from `@complaints/utils`; `apps/mobile` will alias.
 */
export function getOrCreateDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.length > 0) {
      cachedDeviceId = existing;
      return existing;
    }
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, fresh);
    cachedDeviceId = fresh;
    return fresh;
  } catch {
    cachedDeviceId = crypto.randomUUID();
    return cachedDeviceId;
  }
}

/** Test-only: drop the cached deviceId so the next call re-reads storage. */
export function __resetDeviceIdCacheForTests(): void {
  cachedDeviceId = undefined;
}
