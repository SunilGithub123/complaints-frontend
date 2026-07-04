/**
 * deviceId — 2 tests per the minimum-test policy.
 *
 *   1. Happy: first call generates + persists a UUID; second call
 *      returns the cached value without touching storage again.
 *   2. Unhappy: a SecureStore read error falls back to a fresh
 *      in-memory UUID instead of throwing (matches the web helper's
 *      contract — losing the deviceId just spawns a new BE row, not
 *      a crash).
 *
 * We DO NOT test the `Crypto.randomUUID` output format — that's the
 * expo-crypto library's job. We only care that we get back a stable
 * non-empty string.
 */
import * as SecureStore from 'expo-secure-store';

import {
  getOrCreateDeviceId,
  __resetDeviceIdCacheForTests,
  DEVICE_ID_STORAGE_KEY,
} from './deviceId';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    __store: store,
  };
});

jest.mock('expo-crypto', () => {
  let n = 0;
  return {
    __esModule: true,
    randomUUID: jest.fn(() => `uuid-${++n}`),
  };
});

interface SecureStoreMockShape {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  __store: Map<string, string>;
}

const mockSecureStore = SecureStore as unknown as SecureStoreMockShape;

describe('deviceId', () => {
  beforeEach(() => {
    __resetDeviceIdCacheForTests();
    mockSecureStore.__store.clear();
    mockSecureStore.getItemAsync.mockClear();
    mockSecureStore.setItemAsync.mockClear();
  });

  it('generates a UUID on first call and returns the cached value on the second', async () => {
    const first = await getOrCreateDeviceId();
    expect(first).toMatch(/^uuid-\d+$/);
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      DEVICE_ID_STORAGE_KEY,
      first,
      expect.objectContaining({ keychainAccessible: expect.any(String) }),
    );

    const second = await getOrCreateDeviceId();
    expect(second).toBe(first);
    // Second call must hit the in-memory cache, not storage.
    expect(mockSecureStore.getItemAsync).toHaveBeenCalledTimes(1);
  });

  it('falls back to an in-memory UUID when SecureStore.getItemAsync throws', async () => {
    mockSecureStore.getItemAsync.mockRejectedValueOnce(new Error('locked keychain'));

    const id = await getOrCreateDeviceId();
    expect(id).toMatch(/^uuid-\d+$/);
    // Fallback path skips the write — no crash, no persistence.
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

