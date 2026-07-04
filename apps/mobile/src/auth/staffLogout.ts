/**
 * Staff logout — combines the §9.4 best-effort device revoke with
 * the auth-store `clear()` in the right order.
 *
 * Ordering matters:
 *
 *   1. Kick off `revokeStaff(hooks)` — a `customFetch` call. The
 *      transport reads the Bearer token synchronously (via
 *      `selectAuthToken(url)`) BEFORE the first `await`, then hands
 *      the request to `fetch(...)` with the header baked in. So the
 *      in-flight DELETE carries the correct Authorization even
 *      though we clear the store one line later.
 *   2. `authStore.clear()` — wipes tokens + staff summary +
 *      `lastRegisteredDeviceId`. The UI subscription re-renders
 *      immediately and bounces the user back to `/(auth)/staff-login`.
 *
 * The DELETE is fire-and-forget per contract §9.4 — a network
 * failure MUST NOT block the JWT clear (offline logout, hung DNS,
 * captive portal…). `revokeStaff` already swallows all errors and
 * returns `false`; we ignore the promise entirely.
 *
 * No timeout guard needed: because the transport reads the token
 * SYNCHRONOUSLY, there is no window in which `clear()` can beat the
 * fetch to the header. If the network hangs, the pending promise is
 * simply garbage-collected when the JS runtime cleans up.
 */
import { revokeStaff } from '@/lib/pushRegistration';

import { useAuthStore } from './authStore';

export function performStaffLogout(): void {
  const state = useAuthStore.getState();
  // Read `lastRegisteredDeviceId` NOW (pre-clear) into the hooks so
  // even if the store cleared beneath us, the revoke targets the
  // right row. The transport takes it from there.
  const cachedDeviceId = state.lastRegisteredDeviceId;
  void revokeStaff({
    getLastRegisteredDeviceId: () => cachedDeviceId,
    setLastRegisteredDeviceId: (v) =>
      // Post-clear this set is a no-op observer-wise (nothing is
      // subscribed to a signed-out store), but the assignment still
      // completes cleanly against zustand's persisted default state.
      useAuthStore.getState().setLastRegisteredDeviceId(v),
  });
  state.clear();
}

