/**
 * pushRegistration — 2 tests per the minimum-test policy.
 *
 *   1. Happy: register succeeds → `setLastRegisteredDeviceId` called
 *      with the deviceId + outcome is `registered`.
 *   2. Unhappy — load-bearing: first POST rejects with
 *      `INVALID_PUSH_TOKEN_FORMAT` (contract §8) → we fetch a fresh
 *      token from the provider → retry succeeds → outcome
 *      `registered`. This is the retry-once branch; it's the whole
 *      reason we exposed `INVALID_PUSH_TOKEN_FORMAT` as a distinct
 *      code separate from `VALIDATION_FAILED`.
 *
 * Other branches (permission-denied skip, no-token skip, revoke
 * best-effort) are intentionally NOT tested — they're simple guard
 * ladders that would each add a "renders without crashing"-flavour
 * test the policy bans.
 */
import { ApiError } from '@complaints/api';

import {
  registerStaff,
  revokeStaff,
  type RegistrationCallerHooks,
} from './pushRegistration';
import {
  configurePushProvider,
  __resetPushProviderForTests,
  type PushProvider,
} from './pushProvider';
import { __resetDeviceIdCacheForTests } from './deviceId';

const mockRegisterStaffDevice = jest.fn();
const mockRevokeStaffDevice = jest.fn();

jest.mock('@complaints/api', () => {
  const actual = jest.requireActual('@complaints/api');
  return {
    ...actual,
    registerStaffDevice: (...args: unknown[]) => mockRegisterStaffDevice(...args),
    revokeStaffDevice: (...args: unknown[]) => mockRevokeStaffDevice(...args),
    registerConsumerDevice: jest.fn(),
    revokeConsumerDevice: jest.fn(),
  };
});

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
  };
});

jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: jest.fn(() => 'test-device-uuid'),
}));

function makeHooks(): RegistrationCallerHooks & {
  __lastSet: () => string | null;
} {
  let last: string | null = null;
  return {
    getLastRegisteredDeviceId: () => last,
    setLastRegisteredDeviceId: (v) => {
      last = v;
    },
    appVersion: '1.0.0-test',
    __lastSet: () => last,
  };
}

function makeProvider(
  tokens: readonly (string | null)[],
): PushProvider {
  const q = [...tokens];
  return {
    getPushToken: async () => q.shift() ?? null,
    onTokenRefresh: () => () => undefined,
    hasPermission: async () => true,
    requestPermission: async () => true,
  };
}

describe('pushRegistration', () => {
  beforeEach(() => {
    mockRegisterStaffDevice.mockReset();
    mockRevokeStaffDevice.mockReset();
    __resetDeviceIdCacheForTests();
    __resetPushProviderForTests();
  });

  it('registers the staff device and records lastRegisteredDeviceId on success', async () => {
    configurePushProvider(makeProvider(['fresh-fcm-token-abc']));
    mockRegisterStaffDevice.mockResolvedValueOnce({
      status: 201,
      data: { success: true, data: { id: 1 } },
      headers: {} as Headers,
    });
    const hooks = makeHooks();

    const result = await registerStaff(hooks);

    expect(result.outcome).toBe('registered');
    expect(hooks.__lastSet()).toBe('test-device-uuid');
    expect(mockRegisterStaffDevice).toHaveBeenCalledTimes(1);
    const body = mockRegisterStaffDevice.mock.calls[0]?.[0] as {
      deviceId: string;
      pushToken: string;
      appVersion?: string;
    };
    expect(body).toMatchObject({
      deviceId: 'test-device-uuid',
      pushToken: 'fresh-fcm-token-abc',
      appVersion: '1.0.0-test',
    });
  });

  it('fetches a fresh token and retries once on INVALID_PUSH_TOKEN_FORMAT', async () => {
    // Provider hands out a stale token, then a fresh one on retry.
    configurePushProvider(makeProvider(['stale-token', 'fresh-token']));
    mockRegisterStaffDevice
      .mockRejectedValueOnce(
        new ApiError({
          code: 'INVALID_PUSH_TOKEN_FORMAT',
          message: 'bad shape',
          status: 400,
        }),
      )
      .mockResolvedValueOnce({
        status: 201,
        data: { success: true, data: { id: 2 } },
        headers: {} as Headers,
      });
    const hooks = makeHooks();

    const result = await registerStaff(hooks);

    expect(result.outcome).toBe('registered');
    expect(mockRegisterStaffDevice).toHaveBeenCalledTimes(2);
    const firstBody = mockRegisterStaffDevice.mock.calls[0]?.[0] as {
      pushToken: string;
    };
    const secondBody = mockRegisterStaffDevice.mock.calls[1]?.[0] as {
      pushToken: string;
    };
    expect(firstBody.pushToken).toBe('stale-token');
    expect(secondBody.pushToken).toBe('fresh-token');
    expect(hooks.__lastSet()).toBe('test-device-uuid');
  });

  it('revokeStaff is a best-effort no-throw and clears the flag on success', async () => {
    mockRevokeStaffDevice.mockResolvedValueOnce({
      status: 204,
      data: undefined,
      headers: {} as Headers,
    });
    const hooks = makeHooks();
    hooks.setLastRegisteredDeviceId('test-device-uuid');

    const ok = await revokeStaff(hooks);
    expect(ok).toBe(true);
    expect(hooks.__lastSet()).toBeNull();
    expect(mockRevokeStaffDevice).toHaveBeenCalledWith('test-device-uuid');
  });
});

