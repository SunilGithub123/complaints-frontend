/**
 * `fcmPushProvider` — real `PushProvider` implementation backed by
 * `@react-native-firebase/messaging`.
 *
 * Contract references:
 *   - `docs/STAGE_21_DEVICE_TOKEN_CONTRACT.md` §9.3 (token rotation),
 *     §9.6 (permission UX), §2.3 (platform enum).
 *
 * Runtime prerequisites (see `apps/mobile/credentials/README.md`):
 *   1. Real `google-services.json` at `apps/mobile/google-services.json`
 *      (Android) and `GoogleService-Info.plist` at
 *      `apps/mobile/GoogleService-Info.plist` (iOS). The `@react-native-firebase/app`
 *      config plugin reads them via `app.json`.
 *   2. `expo prebuild --clean` after (1) — regenerates `ios/` and
 *      `android/` with the Firebase native code linked.
 *   3. `EXPO_PUBLIC_ENABLE_PUSH=true` in the app's env — `wirePushProvider.ts`
 *      guards the swap on that flag so a dev build with no Firebase
 *      credentials keeps running against the stub.
 *
 * Why we only wrap `messaging()` here and NOT `firebase.initializeApp()`:
 * `@react-native-firebase/app` auto-initialises from the platform
 * credential file. Explicit `initializeApp()` calls are only needed for
 * multi-app scenarios we don't have.
 *
 * Why NO permission-prompt copy is in this file: platform strings
 * (iOS Info.plist `NSUserNotificationsUsageDescription` equivalent,
 * Android runtime prompt) live in the OS. The FE only chooses **when**
 * to prompt (see §9.6 triggers, wired in Stage 21.3-c.2-b), not
 * **what** it says.
 */
import { Platform } from 'react-native';
import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';

import type { PushProvider } from './pushProvider';

export const fcmPushProvider: PushProvider = {
  async getPushToken() {
    try {
      const token = await messaging().getToken();
      return token || null;
    } catch {
      // Underlying causes: no network at first-token time, Firebase
      // not fully initialised, APNs registration blocked on iOS.
      // Return null so `pushRegistration` treats it as a `no-token`
      // skip rather than throwing up into a UI flow.
      return null;
    }
  },

  onTokenRefresh(cb: (token: string) => void): () => void {
    // messaging().onTokenRefresh already returns its own unsubscribe.
    return messaging().onTokenRefresh(cb);
  },

  async hasPermission() {
    const status = await messaging().hasPermission();
    return isAuthorized(status);
  },

  async requestPermission() {
    if (Platform.OS === 'ios') {
      const status = await messaging().requestPermission();
      return isAuthorized(status);
    }
    // Android: on API < 33 permission is granted at install time.
    // On API 33+ Firebase Messaging invokes the runtime prompt via
    // its own JNI path when requestPermission() is called; same code
    // path works for both. `hasPermission()` reflects the outcome.
    const status = await messaging().requestPermission();
    return isAuthorized(status);
  },
};

function isAuthorized(
  status: FirebaseMessagingTypes.AuthorizationStatus,
): boolean {
  // `PROVISIONAL` (iOS silent notifications) counts as granted for
  // our purposes — the BE fan-out still succeeds; the user just
  // doesn't see banners until they promote it in Settings.
  return (
    status === messaging.AuthorizationStatus.AUTHORIZED ||
    status === messaging.AuthorizationStatus.PROVISIONAL
  );
}

