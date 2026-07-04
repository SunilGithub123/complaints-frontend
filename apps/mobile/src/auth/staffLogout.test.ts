/**
 * staffLogout — 2 tests per the minimum-test policy.
 *
 *   1. Happy: a session with `lastRegisteredDeviceId` set fires
 *      `revokeStaffDevice(deviceId)` AND then clears the auth store.
 *   2. Unhappy — load-bearing: `revokeStaffDevice` rejects (network
 *      failure / offline logout) but the store is STILL cleared.
 *      Contract §9.4: "Failed DELETE on logout must not block JWT
 *      clear (best-effort, fire-and-forget)".
 */
import { useAuthStore } from './authStore';
import { performStaffLogout } from './staffLogout';

const mockRevokeStaffDevice = jest.fn();

jest.mock('@complaints/api', () => {
  const actual = jest.requireActual('@complaints/api');
  return {
    ...actual,
    revokeStaffDevice: (...args: unknown[]) => mockRevokeStaffDevice(...args),
    // Reused by pushRegistration.ts's other exports — leave as jest.fn
    // stubs so the module loads without dragging in the real transport.
    registerStaffDevice: jest.fn(),
    registerConsumerDevice: jest.fn(),
    revokeConsumerDevice: jest.fn(),
  };
});

function seedSession(): void {
  useAuthStore.setState({
    accessToken: 'jwt-access',
    refreshToken: 'jwt-refresh',
    staff: {
      id: 1,
      fullName: 'Test Staff',
      role: 'TECHNICIAN',
      email: 't@example.com',
      active: true,
      passwordResetRequired: false,
    } as never,
    lastValidatedAt: null,
    lastRegisteredDeviceId: 'device-abc-123',
  });
}

describe('performStaffLogout', () => {
  beforeEach(() => {
    mockRevokeStaffDevice.mockReset();
    useAuthStore.getState().clear();
  });

  it('fires DELETE /staff/devices/{deviceId} and then clears the auth store', async () => {
    seedSession();
    mockRevokeStaffDevice.mockResolvedValueOnce({
      status: 204,
      data: undefined,
      headers: {} as Headers,
    });

    performStaffLogout();

    // Store MUST clear synchronously — the UI subscription needs to
    // bounce to /(auth)/staff-login on the same tick.
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().lastRegisteredDeviceId).toBeNull();

    // Give the fire-and-forget promise a microtask to resolve.
    await Promise.resolve();
    await Promise.resolve();
    expect(mockRevokeStaffDevice).toHaveBeenCalledWith('device-abc-123');
  });

  it('still clears the auth store when the DELETE rejects (offline logout)', async () => {
    seedSession();
    mockRevokeStaffDevice.mockRejectedValueOnce(new Error('offline'));

    performStaffLogout();

    expect(useAuthStore.getState().accessToken).toBeNull();
    // Let the rejected promise settle inside revokeStaff's swallow.
    await Promise.resolve();
    await Promise.resolve();
    expect(mockRevokeStaffDevice).toHaveBeenCalledTimes(1);
  });
});

