/**
 * `pushProvider` — Strategy-pattern boundary for the FCM / APNs push
 * token acquisition surface.
 *
 * Contract §9.3 says the FE re-registers on (a) every cold start and
 * (b) FCM `onTokenRefresh`. To implement either, we need a source of
 * push tokens. That source depends on native modules
 * (`@react-native-firebase/messaging`) which land in Stage 21.3-c.2 —
 * shipping the native install + Firebase project credentials is a
 * separate, user-blocking step (google-services.json /
 * GoogleService-Info.plist).
 *
 * This module defines the **interface** and a **stub** implementation
 * so that:
 *
 *   1. The registration orchestration (`pushRegistration.ts`) can be
 *      built + tested against the dev BE right now, using the stub's
 *      deterministic token strings.
 *   2. When the real FCM install lands in c.2 the swap is a two-line
 *      `configurePushProvider(fcmProvider)` call at boot — no
 *      behaviour changes in the caller.
 *
 * Rationale for adding a Strategy here (vs "just inline the FCM call
 * in c.2"): (a) the copilot-instructions call this out as the *one*
 * FE Strategy that earns its keep on this codebase, (b) it makes
 * pushRegistration unit-testable without mocking Firebase Messaging,
 * (c) the stub is what runs in jest-expo test files anyway.
 */
import { Platform } from 'react-native';
import type { Schemas } from '@complaints/api';

export interface PushProvider {
  /**
   * Return the current push token, or `null` if permission was denied
   * / no token is available. Real impl (c.2) calls
   * `messaging().getToken()`. Stub returns a synthetic string.
   */
  getPushToken(): Promise<string | null>;
  /**
   * Register a callback for FCM token rotation. Real impl (c.2) calls
   * `messaging().onTokenRefresh(cb)` and returns its unsubscribe fn.
   * Stub returns a no-op unsubscribe.
   */
  onTokenRefresh(cb: (token: string) => void): () => void;
  /**
   * Whether OS-level push permission is granted RIGHT NOW. Called on
   * every cold start; §9.6 revoke-detection uses this to trigger a
   * `DELETE /devices/{deviceId}` when the user turned notifications
   * off in Settings between app launches.
   */
  hasPermission(): Promise<boolean>;
  /**
   * Request OS-level permission from the user. Real impl (c.2) calls
   * `messaging().requestPermission()` on iOS and no-ops on Android
   * (permission is granted at install time on Android < 13; a
   * runtime prompt fires on Android 13+). Returns whether granted.
   */
  requestPermission(): Promise<boolean>;
}

/** Contract §3.1 platform enum, resolved from RN's `Platform.OS`. */
export function currentPlatform(): Schemas.DeviceRegistrationRequestPlatform {
  // Contract §2.3 v1.0.1: `WEB` stays reachable but is a no-op recipient
  // on the BE. Mobile only ever sends ANDROID or IOS.
  if (Platform.OS === 'ios') return 'IOS';
  return 'ANDROID';
}

// ─── Stub provider ──────────────────────────────────────────────────

/**
 * Deterministic-token stub. Ships as the DEFAULT provider until c.2
 * swaps in the real FCM one. Every install gets the same
 * `stub-token-<platform>` string — the BE `INVALID_PUSH_TOKEN_FORMAT`
 * shape check (§8) will 400 this in prod, which is intentional: the
 * stub must be replaced before a prod build.
 */
export const stubPushProvider: PushProvider = {
  getPushToken: async () => `stub-token-${Platform.OS}`,
  onTokenRefresh: (_cb) => () => {
    /* no-op unsubscribe */
  },
  hasPermission: async () => true,
  requestPermission: async () => true,
};

let activeProvider: PushProvider = stubPushProvider;

/** Boot-time swap. c.2 calls `configurePushProvider(realFcmProvider)`. */
export function configurePushProvider(provider: PushProvider): void {
  activeProvider = provider;
}

/** Read the current provider — internal to `pushRegistration.ts` + tests. */
export function getActivePushProvider(): PushProvider {
  return activeProvider;
}

/** Test-only: restore the default stub between tests. */
export function __resetPushProviderForTests(): void {
  activeProvider = stubPushProvider;
}

