/**
 * fcmPushProvider — 2 tests per the minimum-test policy.
 *
 *   1. Happy: `getPushToken` returns the FCM token; `hasPermission`
 *      / `requestPermission` map AUTHORIZED → true.
 *   2. Unhappy: `messaging().getToken()` throws → `getPushToken`
 *      swallows and returns `null` (contract: pushRegistration
 *      treats null as a no-token skip, not a crash).
 *
 * We do NOT test the PROVISIONAL branch of `isAuthorized` — one enum
 * variant beyond the AUTHORIZED case; that's a "renders without
 * crashing"-flavour test the policy bans.
 */
import messaging from '@react-native-firebase/messaging';

import { fcmPushProvider } from './fcmPushProvider';

// The default export is a jest.fn per `jest.setup.ts`; cast at the
// boundary so per-test overrides are typed.
type MessagingInstance = {
  getToken: jest.Mock;
  hasPermission: jest.Mock;
  requestPermission: jest.Mock;
  onTokenRefresh: jest.Mock;
};
const messagingFactory = messaging as unknown as jest.Mock<MessagingInstance>;

function overrideMessaging(overrides: Partial<MessagingInstance>): void {
  messagingFactory.mockImplementationOnce(() => ({
    getToken: jest.fn(async () => 'fcm-fixture-token'),
    hasPermission: jest.fn(async () => messaging.AuthorizationStatus.AUTHORIZED),
    requestPermission: jest.fn(
      async () => messaging.AuthorizationStatus.AUTHORIZED,
    ),
    onTokenRefresh: jest.fn(() => () => undefined),
    ...overrides,
  }));
}

describe('fcmPushProvider', () => {
  beforeEach(() => {
    messagingFactory.mockClear();
  });

  it('returns the FCM token when messaging.getToken resolves', async () => {
    overrideMessaging({
      getToken: jest.fn(async () => 'real-fcm-token-abc'),
    });
    const token = await fcmPushProvider.getPushToken();
    expect(token).toBe('real-fcm-token-abc');

    // requestPermission / hasPermission both map AUTHORIZED → true.
    expect(await fcmPushProvider.hasPermission()).toBe(true);
    expect(await fcmPushProvider.requestPermission()).toBe(true);
  });

  it('returns null when messaging.getToken throws (no-token skip contract)', async () => {
    overrideMessaging({
      getToken: jest.fn(async () => {
        throw new Error('APNs registration blocked');
      }),
    });
    const token = await fcmPushProvider.getPushToken();
    expect(token).toBeNull();
  });
});

