/**
 * Jest setup — loaded via `setupFilesAfterEnv` so jest's `expect`,
 * `afterEach` and friends are already injected into the global scope.
 *
 * Two responsibilities:
 *
 *   1. `@testing-library/react-native/extend-expect` registers the
 *      native-aware matchers (`toBeOnTheScreen`, etc.) so assertions
 *      read naturally.
 *   2. `initI18n()` bootstraps the i18next singleton with the English
 *      catalogue. Without this every label / button / error message
 *      renders as the raw key (`consumer.otp.verify` instead of
 *      "Verify"), breaking every `getByLabelText` / `getByRole(name:)`
 *      query in the test files.
 *
 * Per-test store resets live in each test file's `beforeEach`. A global
 * `afterEach` was considered, but keeping it inline makes each test's
 * isolation contract self-documenting.
 *
 * NB the jest option is `setupFilesAfterEnv` (not `setupFilesAfterEach`
 * which sounds plausible but doesn't exist). See incident #1 in the
 * Stage 21.3-b.3-b-1 implementation-log entry.
 */
import '@testing-library/react-native/extend-expect';

import { initI18n } from '@complaints/i18n';

// jest-expo's preset does NOT auto-mock `@react-native-async-storage/async-storage`
// — the module errors with "NativeModule: AsyncStorage is null" the
// moment any code path touches it (draftStorage, wireI18n, …). The
// upstream project ships an in-memory jest mock; wire it once here so
// every test file gets it without repeating the boilerplate.
// See: https://react-native-async-storage.github.io/async-storage/docs/advanced/jest
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// `@react-native-firebase/messaging` binds to a native TurboModule the
// moment its default export is invoked. jest-expo does not stub it —
// left alone, any test that transitively imports `fcmPushProvider`
// crashes with `Native module RNFBMessagingModule not found`. Ship an
// in-memory stub that mirrors the tiny slice of the API `fcmPushProvider`
// touches (`getToken`, `hasPermission`, `requestPermission`,
// `onTokenRefresh` + the `AuthorizationStatus` enum on the default
// export function itself). Per-test overrides live in the test files.
jest.mock('@react-native-firebase/messaging', () => {
  const AuthorizationStatus = {
    NOT_DETERMINED: -1,
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    EPHEMERAL: 3,
  };
  const impl = jest.fn(() => ({
    getToken: jest.fn(async () => 'fcm-fixture-token'),
    hasPermission: jest.fn(async () => AuthorizationStatus.AUTHORIZED),
    requestPermission: jest.fn(async () => AuthorizationStatus.AUTHORIZED),
    onTokenRefresh: jest.fn(() => () => undefined),
  }));
  (impl as unknown as { AuthorizationStatus: typeof AuthorizationStatus }).AuthorizationStatus =
    AuthorizationStatus;
  return { __esModule: true, default: impl };
});

initI18n();


