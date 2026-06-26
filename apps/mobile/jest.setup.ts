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

initI18n();


