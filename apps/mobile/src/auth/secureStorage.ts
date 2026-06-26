/**
 * Zustand persist adapter backed by `expo-secure-store`.
 *
 * Used by `authStore` for staff JWTs (access + refresh) — these are
 * sensitive bearer credentials and must be encrypted at rest. iOS routes
 * through Keychain; Android through `EncryptedSharedPreferences` (API 23+).
 *
 * Caveat: `expo-secure-store` has a per-value size limit of ~2KB on
 * Android. Our combined staff session blob (two JWTs + a short profile
 * summary) sits comfortably under that, but if BE ever balloons the
 * `StaffSummaryResponse` we'll need to split keys. Not paying that cost
 * today.
 */
import * as SecureStore from 'expo-secure-store';
import type { StateStorage } from 'zustand/middleware';

export const secureStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch {
      // First read on a fresh install or after `clear()` — treat as empty.
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await SecureStore.setItemAsync(name, value, {
      // Keychain accessibility: only when device is unlocked, this device only.
      // Matches contract §9 deviceId storage guidance (no iCloud sync of
      // bearer credentials).
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch {
      // Already absent — fine.
    }
  },
};

