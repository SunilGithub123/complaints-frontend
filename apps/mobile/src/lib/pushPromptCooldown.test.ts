/**
 * pushPromptCooldown — 2 tests per the minimum-test policy.
 *
 *   1. Happy: `markDenied('staff')` → `isCoolingDown('staff')` returns
 *      `true` at now, and `false` at now + 7 days + 1 ms. Same key does
 *      NOT affect the `'consumer'` principal (independent keys).
 *   2. Unhappy: corrupt AsyncStorage payload → `loadDeniedAt` returns
 *      `null` (treated as "never denied") instead of throwing.
 *
 * jest-expo mocks AsyncStorage via the wireup in `jest.setup.ts`, so
 * no explicit module mock is needed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadDeniedAt,
  markDenied,
  clearDenied,
  isCoolingDown,
  __COOLDOWN_MS_FOR_TESTS__,
} from './pushPromptCooldown';

describe('pushPromptCooldown', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('records a per-principal deny and reports cool-down until the 7-day window closes', async () => {
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);

    await markDenied('staff', now);
    expect(await loadDeniedAt('staff')).toBe(now);
    expect(await loadDeniedAt('consumer')).toBeNull();

    expect(await isCoolingDown('staff', now)).toBe(true);
    expect(
      await isCoolingDown('staff', now + __COOLDOWN_MS_FOR_TESTS__ - 1),
    ).toBe(true);
    expect(
      await isCoolingDown('staff', now + __COOLDOWN_MS_FOR_TESTS__ + 1),
    ).toBe(false);

    // Cross-principal isolation — staff deny doesn't cool consumer.
    expect(await isCoolingDown('consumer', now)).toBe(false);

    await clearDenied('staff');
    expect(await loadDeniedAt('staff')).toBeNull();
  });

  it('treats a corrupt stored value as never-denied instead of throwing', async () => {
    // Bypass markDenied to plant garbage; matches the shape-guard
    // contract in draftStorage.
    await AsyncStorage.setItem('pushPromptDeniedAt_v1_staff', 'not-a-number');

    expect(await loadDeniedAt('staff')).toBeNull();
    expect(await isCoolingDown('staff')).toBe(false);
  });
});

