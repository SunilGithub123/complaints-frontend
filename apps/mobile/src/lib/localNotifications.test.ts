/**
 * localNotifications — 2 tests per the minimum-test policy.
 *
 *   1. Happy: `displayLocalNotificationForFrame(frame)` calls
 *      `scheduleNotificationAsync` with the frame's title/body and
 *      routing identifiers on `data`. Load-bearing — the tap
 *      listener rebuilds a frame from this exact `data` payload.
 *   2. Unhappy: `scheduleNotificationAsync` throws → the helper
 *      returns `null` instead of throwing (message-handler
 *      contract: never crash the background JS context).
 */
import * as Notifications from 'expo-notifications';

import {
  configureLocalNotifications,
  displayLocalNotificationForFrame,
} from './localNotifications';
import type { ParsedPushFrame } from './pushFrame';

interface NotificationsMock {
  scheduleNotificationAsync: jest.Mock;
  setNotificationHandler: jest.Mock;
  setNotificationChannelAsync: jest.Mock;
  __scheduled: unknown[];
}

const notif = Notifications as unknown as NotificationsMock;

const frame: ParsedPushFrame = {
  type: 'COMPLAINT_ASSIGNED',
  ticketNo: 'MH20260600000007',
  complaintId: '7',
  title: 'New complaint assigned',
  body: 'Ticket MH20260600000007 - HIGH severity',
  eventOccurredAt: '2026-07-05T10:00:00+05:30',
  schemaVersion: '1',
};

describe('localNotifications', () => {
  beforeEach(() => {
    notif.scheduleNotificationAsync.mockClear();
    notif.setNotificationHandler.mockClear();
    notif.__scheduled.length = 0;
  });

  it('schedules a local notification with the frame title/body and routing data', async () => {
    const id = await displayLocalNotificationForFrame(frame);
    expect(id).toBe('notif-1');

    expect(notif.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = notif.scheduleNotificationAsync.mock.calls[0]?.[0] as {
      content: {
        title: string;
        body: string;
        data: Record<string, string>;
      };
      trigger: unknown;
    };
    expect(call.content.title).toBe(frame.title);
    expect(call.content.body).toBe(frame.body);
    expect(call.content.data).toMatchObject({
      complaintId: '7',
      ticketNo: 'MH20260600000007',
      pushType: 'COMPLAINT_ASSIGNED',
      eventOccurredAt: '2026-07-05T10:00:00+05:30',
    });
    // Immediate delivery.
    expect(call.trigger).toBeNull();
  });

  it('returns null when scheduleNotificationAsync throws', async () => {
    notif.scheduleNotificationAsync.mockRejectedValueOnce(
      new Error('permission not granted'),
    );

    const id = await displayLocalNotificationForFrame(frame);
    expect(id).toBeNull();
  });

  it('configureLocalNotifications wires the foreground handler', async () => {
    await configureLocalNotifications();
    expect(notif.setNotificationHandler).toHaveBeenCalledTimes(1);
  });
});

