/**
 * `detectRevokedPushPermission` — cold-start reconciliation per contract §9.6:
 *
 *   > If permission is revoked later: FE detects on next launch via
 *   > getPermissionsAsync() and does call DELETE /devices/{deviceId}
 *   > so BE stops fanning out to a dead token before the nightly sweep
 *   > catches it.
 *
 * Called once at boot from `_layout.tsx`, fire-and-forget. Iterates
 * both principal stores; whichever has a `lastRegisteredDeviceId` set
 * without OS-level permission gets a best-effort DELETE.
 *
 * Skips the entire check when the stub `PushProvider` is active — the
 * stub always reports `hasPermission: true`, so this would be a no-op
 * on dev builds anyway. The check runs only under real FCM, guarded
 * by `EXPO_PUBLIC_ENABLE_PUSH === 'true'`.
 *
 * Waits for both stores to finish SecureStore rehydration before
 * inspecting `lastRegisteredDeviceId` — reading it too early would see
 * a spurious `null` and skip the DELETE.
 */
import { useAuthStore } from '@/auth/authStore';
import { useConsumerAuthStore } from '@/auth/consumerAuthStore';

import { getActivePushProvider } from './pushProvider';
import { revokeStaff, revokeConsumer } from './pushRegistration';

function waitForHydration<T>(store: {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (cb: (state: T) => void) => () => void;
  };
}): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = store.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

export async function detectRevokedPushPermission(): Promise<void> {
  if (process.env.EXPO_PUBLIC_ENABLE_PUSH !== 'true') return;

  await Promise.all([
    waitForHydration(useAuthStore),
    waitForHydration(useConsumerAuthStore),
  ]);

  let granted: boolean;
  try {
    granted = await getActivePushProvider().hasPermission();
  } catch {
    // Ambiguous state — do nothing rather than aggressively revoke.
    return;
  }
  if (granted) return;

  const staffHooks = {
    getLastRegisteredDeviceId: () =>
      useAuthStore.getState().lastRegisteredDeviceId,
    setLastRegisteredDeviceId: (v: string | null) =>
      useAuthStore.getState().setLastRegisteredDeviceId(v),
  };
  const consumerHooks = {
    getLastRegisteredDeviceId: () =>
      useConsumerAuthStore.getState().lastRegisteredDeviceId,
    setLastRegisteredDeviceId: (v: string | null) =>
      useConsumerAuthStore.getState().setLastRegisteredDeviceId(v),
  };

  // Both are best-effort no-throws (see `pushRegistration.ts`). Fire
  // in parallel; the two auth-scoped rows are independent server-side.
  await Promise.all([revokeStaff(staffHooks), revokeConsumer(consumerHooks)]);
}

