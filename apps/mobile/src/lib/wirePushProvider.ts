/**
 * Boot-time swap: replace the default stub `PushProvider` with the
 * real FCM one when the app is built with push enabled.
 *
 * Guarded on `EXPO_PUBLIC_ENABLE_PUSH === 'true'` so that:
 *
 *   - Local dev without Firebase credentials still boots (the stub
 *     provider hands out `stub-token-<platform>` and every
 *     `hasPermission()` returns true — pushRegistration exercises
 *     the full happy path against the dev BE).
 *   - CI + Detox smoke tests can opt in.
 *   - A prod build always sets the flag in its `.env` and gets the
 *     real FCM transport.
 *
 * Dynamic import of `fcmPushProvider` behind the flag is deliberate:
 * the top-level `import '@react-native-firebase/messaging'` triggers
 * a native-module lookup on RN, and without the credentials-plugin
 * having run through `expo prebuild --clean` that lookup logs a
 * loud warning at boot. Deferring the import to the flag-on branch
 * keeps the dev boot silent.
 *
 * NB: dynamic imports return promises. `wirePushProvider()` is
 * fire-and-forget from `_layout.tsx` — the stub keeps serving until
 * the swap resolves (typically <50 ms), which is fine because no
 * push registration fires until user gesture (post-login /
 * post-submit trigger, Stage 21.3-c.2-b).
 */
import { configurePushProvider } from './pushProvider';

export function wirePushProvider(): void {
  if (process.env.EXPO_PUBLIC_ENABLE_PUSH !== 'true') return;

  // Dynamic import keeps the RN Firebase native lookup off the
  // boot path for dev builds without credentials.
  import('./fcmPushProvider')
    .then(({ fcmPushProvider }) => {
      configurePushProvider(fcmPushProvider);
    })
    .catch(() => {
      // Import failure means Metro couldn't resolve the module
      // (typical: `pnpm install` skipped, or Firebase deps are
      // out of the tree). The stub keeps running, which is exactly
      // the safe fallback we want.
    });
}

