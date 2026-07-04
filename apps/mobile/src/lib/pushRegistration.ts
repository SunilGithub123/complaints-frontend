/**
 * Push-registration orchestration.
 *
 * Implements the client half of `docs/STAGE_21_DEVICE_TOKEN_CONTRACT.md`
 * §3.1 / §3.3 for the mobile app:
 *
 *   - `registerConsumer(...)` / `registerStaff(...)` — POST to
 *     `/api/v1/consumer/devices` or `/staff/devices`. Called from the
 *     §9.6 permission-grant moments (staff: after first successful
 *     login; consumer: after first successful submit). The auth
 *     store's `lastRegisteredDeviceId` flag lets callers cheaply skip
 *     the round trip when the same device is already registered under
 *     the current principal.
 *   - `revokeStaff(...)` — DELETE on logout per §9.4. Best-effort:
 *     failures MUST NOT block the JWT clear (caller handles that).
 *
 * Design notes:
 *
 * 1. **Called from non-React contexts** (auth-store `clear()` hook,
 *    submit success handler). We call the generated `registerStaffDevice`
 *    / `revokeStaffDevice` async functions directly — NOT the
 *    `useRegister…` hooks — so this file has no React dependency.
 *    TanStack Query hooks are for query-cache-backed data; a
 *    fire-and-forget POST driven by a lifecycle event is a plain
 *    function call.
 *
 * 2. **`INVALID_PUSH_TOKEN_FORMAT` retry-once** per contract §8:
 *    if the BE rejects our token shape, we ask the provider for a
 *    fresh one and retry ONCE. If the retry also fails we surface the
 *    error to the caller (which typically just logs + carries on —
 *    push failure MUST NOT block auth or submit flows).
 *
 * 3. **No optimistic-registration cache** in v1. The
 *    `lastRegisteredDeviceId` short-circuit is deliberately
 *    conservative: it only skips when the (deviceId, principal-scope)
 *    key matches. Any token rotation forces a re-register even if
 *    the key matches, so a rotated FCM token never leaves the BE
 *    holding a stale row.
 *
 * 4. **Never log the push token** (§6.2). This module doesn't log at
 *    all in v1; the Sentry `beforeSend` mirror in Phase 7 will scrub
 *    any accidental payload leak.
 */
import {
  registerConsumerDevice,
  registerStaffDevice,
  revokeConsumerDevice,
  revokeStaffDevice,
  ApiError,
  type Schemas,
} from '@complaints/api';

import { getOrCreateDeviceId } from './deviceId';
import { currentPlatform, getActivePushProvider } from './pushProvider';

/** Distinguishes "we sent it" from "we skipped because nothing changed". */
export type RegistrationOutcome =
  | { outcome: 'registered'; deviceId: string; rotated: boolean }
  | { outcome: 'skipped'; deviceId: string; reason: 'already-registered' }
  | { outcome: 'skipped'; deviceId: string; reason: 'no-token' | 'no-permission' };

export interface RegistrationCallerHooks {
  /** Current `lastRegisteredDeviceId` for this principal. */
  getLastRegisteredDeviceId: () => string | null;
  /** Persist a successful (or invalidate a failed) registration. */
  setLastRegisteredDeviceId: (deviceId: string | null) => void;
  /** Optional app version tag for staged rollout diagnostics. */
  appVersion?: string;
}

async function buildRequest(
  hooks: RegistrationCallerHooks,
  pushTokenOverride?: string,
): Promise<
  | { kind: 'ok'; body: Schemas.DeviceRegistrationRequest; deviceId: string }
  | { kind: 'skip'; deviceId: string; reason: 'no-token' | 'no-permission' }
> {
  const deviceId = await getOrCreateDeviceId();
  const provider = getActivePushProvider();

  const permitted = await provider.hasPermission();
  if (!permitted) {
    // Silently invalidate — if the token was revoked, the BE row
    // should be cleaned up separately (§9.6 revoke-detection lands
    // with the real FCM impl in c.2).
    hooks.setLastRegisteredDeviceId(null);
    return { kind: 'skip', deviceId, reason: 'no-permission' };
  }

  const pushToken = pushTokenOverride ?? (await provider.getPushToken());
  if (!pushToken) {
    hooks.setLastRegisteredDeviceId(null);
    return { kind: 'skip', deviceId, reason: 'no-token' };
  }

  const body: Schemas.DeviceRegistrationRequest = {
    deviceId,
    platform: currentPlatform(),
    pushToken,
    ...(hooks.appVersion ? { appVersion: hooks.appVersion } : {}),
  };
  return { kind: 'ok', body, deviceId };
}

async function doRegister(
  target: 'consumer' | 'staff',
  hooks: RegistrationCallerHooks,
): Promise<RegistrationOutcome> {
  const prepared = await buildRequest(hooks);
  if (prepared.kind === 'skip') {
    return { outcome: 'skipped', deviceId: prepared.deviceId, reason: prepared.reason };
  }

  const rpc =
    target === 'consumer' ? registerConsumerDevice : registerStaffDevice;

  try {
    await rpc(prepared.body);
    const previous = hooks.getLastRegisteredDeviceId();
    hooks.setLastRegisteredDeviceId(prepared.deviceId);
    return {
      outcome: 'registered',
      deviceId: prepared.deviceId,
      rotated: previous === prepared.deviceId,
    };
  } catch (err) {
    if (err instanceof ApiError && err.code === 'INVALID_PUSH_TOKEN_FORMAT') {
      // Contract §8: fetch a fresh token and retry ONCE. Same
      // deviceId; different pushToken.
      const fresh = await getActivePushProvider().getPushToken();
      if (!fresh) {
        hooks.setLastRegisteredDeviceId(null);
        throw err;
      }
      const retryBody: Schemas.DeviceRegistrationRequest = {
        ...prepared.body,
        pushToken: fresh,
      };
      await rpc(retryBody);
      hooks.setLastRegisteredDeviceId(prepared.deviceId);
      return {
        outcome: 'registered',
        deviceId: prepared.deviceId,
        rotated: true,
      };
    }
    throw err;
  }
}

/**
 * Register the current device under the calling **consumer** principal.
 * Trigger point per §9.6: after the first successful complaint submit
 * (c.2 wires the trigger; c.1 ships the helper).
 */
export function registerConsumer(
  hooks: RegistrationCallerHooks,
): Promise<RegistrationOutcome> {
  return doRegister('consumer', hooks);
}

/**
 * Register the current device under the calling **staff** principal.
 * Trigger point per §9.6: after the first successful login post
 * password-change gate.
 */
export function registerStaff(
  hooks: RegistrationCallerHooks,
): Promise<RegistrationOutcome> {
  return doRegister('staff', hooks);
}

/**
 * Best-effort revoke for staff logout per §9.4. Never throws — a
 * failed DELETE MUST NOT block the JWT clear (caller may still be
 * offline; the BE nightly sweep collects the row eventually).
 * Returns `true` iff the DELETE succeeded.
 */
export async function revokeStaff(
  hooks: RegistrationCallerHooks,
): Promise<boolean> {
  const last = hooks.getLastRegisteredDeviceId();
  if (!last) return false;
  try {
    await revokeStaffDevice(last);
    hooks.setLastRegisteredDeviceId(null);
    return true;
  } catch {
    // Swallow. The store `clear()` still runs; BE eventually
    // reconciles via §6.1 permanent-failure detection or the sweep.
    return false;
  }
}

/**
 * Consumer revoke — kept symmetric with `revokeStaff` for the day a
 * consumer-side "log out of all devices" screen lands. Not wired
 * into any lifecycle in v1 per §9.4 ("Consumer: no explicit revoke").
 */
export async function revokeConsumer(
  hooks: RegistrationCallerHooks,
): Promise<boolean> {
  const last = hooks.getLastRegisteredDeviceId();
  if (!last) return false;
  try {
    await revokeConsumerDevice(last);
    hooks.setLastRegisteredDeviceId(null);
    return true;
  } catch {
    return false;
  }
}

