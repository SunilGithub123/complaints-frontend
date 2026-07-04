/**
 * `deviceId` — stable per-install UUID for the push-registration
 * subject key. Mobile twin of `@complaints/utils#getOrCreateDeviceId`
 * (which uses `localStorage` on web).
 *
 * Storage per §2.3 / §9 of `docs/STAGE_21_DEVICE_TOKEN_CONTRACT.md`:
 *
 *   - iOS: `expo-secure-store` → Keychain (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`)
 *     — survives app reinstall.
 *   - Android: `expo-secure-store` → EncryptedSharedPreferences (API 23+)
 *     — survives reinstall on Android 12+.
 *
 * Kept **separate** from the staff / consumer auth store persistences:
 *
 *   - Auth stores clear on logout; `deviceId` must NOT.
 *   - Multi-account on one device (§2.4) — the same `deviceId` is
 *     registered under two different principals; scoping it under
 *     either auth store would break that.
 *
 * Not promoted to `@complaints/utils` yet: doing so would drag
 * `expo-secure-store` into the utils dep graph and force a
 * conditional-export dance the shared package deliberately avoids.
 * When a second RN app needs the same helper we'll promote — the
 * "abstract at the second use" rule (see AGENTS.md §Design rules).
 *
 * Concurrency: two rapid callers on cold start could each miss the
 * in-flight write and generate two UUIDs. The `inFlight` promise
 * guard coalesces onto a single storage round trip so only one UUID
 * lands on disk.
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

// Same underscore convention as `complaints_auth` / `complaints_consumer_auth` —
// SecureStore rejects colons on device (see 21.3-b.1 incident #5).
export const DEVICE_ID_STORAGE_KEY = 'crs_deviceId';

let cachedDeviceId: string | undefined;
let inFlight: Promise<string> | null = null;

/**
 * Return the persistent `deviceId` UUID for this install. First call
 * generates + persists; subsequent calls return the cached value.
 *
 * Never throws — a SecureStore read failure falls back to an in-memory
 * UUID for the session, which just creates a new BE row that ages out
 * via the nightly sweep (same failure mode as web's localStorage).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const existing = await SecureStore.getItemAsync(DEVICE_ID_STORAGE_KEY);
      if (existing && existing.length > 0) {
        cachedDeviceId = existing;
        return existing;
      }
      const fresh = Crypto.randomUUID();
      try {
        await SecureStore.setItemAsync(DEVICE_ID_STORAGE_KEY, fresh, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      } catch {
        // Write failure — cache in memory and press on. The next launch
        // will generate a new one; BE nightly sweep collects the orphan.
      }
      cachedDeviceId = fresh;
      return fresh;
    } catch {
      const fallback = Crypto.randomUUID();
      cachedDeviceId = fallback;
      return fallback;
    } finally {
      // Cleared on next tick so any coalesced callers still resolve
      // against the same in-flight promise.
      queueMicrotask(() => {
        inFlight = null;
      });
    }
  })();

  return inFlight;
}

/** Test-only: drop the module cache so the next call re-reads storage. */
export function __resetDeviceIdCacheForTests(): void {
  cachedDeviceId = undefined;
  inFlight = null;
}

