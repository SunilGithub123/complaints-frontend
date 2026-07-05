/**
 * Local-notification display wrapper for FCM data-only frames.
 *
 * Contract §4 mandates data-only FCM messages, which means neither
 * platform auto-renders a banner:
 *   - iOS foreground: silent by default (`onMessage` fires; nothing
 *     visual happens unless we schedule a local notification).
 *   - iOS background: silent pushes only wake JS if the BE sets
 *     `apns.payload.aps.content-available = 1`; when they do,
 *     `setBackgroundMessageHandler` fires and we schedule a local
 *     notification here.
 *   - Android foreground: same as iOS — `onMessage` fires; we
 *     schedule to display.
 *   - Android background: `setBackgroundMessageHandler` runs in a
 *     headless JS context. Scheduling a local notification here is
 *     how the user sees anything.
 *
 * We keep `title` / `body` as-is from the frame (already English-
 * only, server-rendered per §4 / §9.1). `data` carries the routing
 * identifiers so the tap-response listener in `pushMessageHandler.ts`
 * can navigate without re-parsing the FCM frame.
 *
 * §6.2 never-log rules: local notifications DISPLAY `title`/`body`
 * (which is the whole point) but this file DOES NOT log them. The
 * console side stays in `pushMessageHandler.ts`.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { ParsedPushFrame } from './pushFrame';

const ANDROID_CHANNEL_ID = 'default';

/**
 * Cached OS display-permission verdict. `null` means "not yet checked
 * this session"; a boolean means "we asked (or read) at least once".
 *
 * We cache to avoid a `getPermissionsAsync()` round-trip on every
 * incoming FCM frame (both `onMessage` and the background handler
 * call `displayLocalNotificationForFrame` on every message).
 * `resetNotificationDisplayPermissionCacheForTests` exists so unit
 * tests can assert first-call behaviour.
 */
let displayPermissionCache: boolean | null = null;

/**
 * Test-only: clear the cached display-permission verdict.
 */
export function __resetNotificationDisplayPermissionCacheForTests(): void {
  displayPermissionCache = null;
}

/**
 * Ensure the OS-level notification-DISPLAY permission is granted.
 *
 * This is orthogonal to FCM's `messaging().requestPermission()` — that
 * one governs whether Firebase Cloud Messaging can deliver messages
 * to the app at all (APNs entitlement on iOS; no-op on Android <13;
 * POST_NOTIFICATIONS runtime prompt on Android 13+). `expo-
 * notifications` owns a SEPARATE permission surface for
 * `scheduleNotificationAsync` — without it, `displayLocalNotification
 * ForFrame` silently drops on Android 13+ (the OS suppresses the
 * banner) even when FCM itself is happily delivering the data frame.
 *
 * Called from `usePushRegistration` immediately after the FCM grant
 * so both prompts land in the same permission moment. Callers that
 * only want to READ (§9.6 cold-start revoke detection, `display
 * LocalNotificationForFrame` fast-path) pass `{ request: false }`.
 *
 * Never throws. A native failure is treated as "not granted".
 */
export async function ensureNotificationDisplayPermission(opts?: {
  request?: boolean;
}): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      displayPermissionCache = true;
      return true;
    }
    // `canAskAgain === false` means the user hard-denied; the OS won't
    // show its dialog even if we call requestPermissionsAsync. Cache
    // and bail so we don't repeatedly no-op through the native bridge.
    if (opts?.request && current.canAskAgain !== false) {
      const next = await Notifications.requestPermissionsAsync();
      displayPermissionCache = next.granted;
      return next.granted;
    }
    displayPermissionCache = false;
    return false;
  } catch {
    displayPermissionCache = false;
    return false;
  }
}

/**
 * Configure the OS-level display defaults. Call once at boot,
 * before any `scheduleNotificationAsync`. Idempotent — repeat
 * calls just re-assert the handler + channel.
 */
export async function configureLocalNotifications(): Promise<void> {
  // Foreground handler: without this, iOS suppresses banners while
  // the app is open (expo-notifications default). Android respects
  // the channel's importance regardless.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false, // v1 — polish later if users ask
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Complaints',
      importance: Notifications.AndroidImportance.DEFAULT,
      // No sound, no vibration, no light — v1 stays quiet; users
      // opt in via OS settings if they want more.
      sound: null,
      vibrationPattern: [0],
      enableVibrate: false,
      lightColor: '#0f172a',
    });
  }
}

/**
 * Schedule an immediate local notification carrying the frame's
 * routing identifiers. Returns the notification id (rarely used;
 * we don't build a "dismiss all" flow in v1).
 *
 * Never throws — a scheduling failure logs at debug (not here — the
 * caller in `pushMessageHandler` knows the context) and returns
 * `null` so the message-handling flow doesn't blow up.
 */
export async function displayLocalNotificationForFrame(
  frame: ParsedPushFrame,
): Promise<string | null> {
  // Fast-path short-circuit: if a prior `ensureNotificationDisplay
  // Permission` call cached a denial, don't spend the native bridge
  // round-trip. Android 13+ silently drops the schedule anyway.
  if (displayPermissionCache === false) return null;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: frame.title,
        body: frame.body,
        // Data ends up on the notification-tap response; the tap
        // handler reads this back and calls `safeNavigate`. Values
        // must be JSON-serialisable — strings are fine.
        data: {
          complaintId: frame.complaintId,
          ticketNo: frame.ticketNo,
          pushType: frame.type,
          eventOccurredAt: frame.eventOccurredAt,
        },
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      // `null` trigger = fire immediately.
      trigger: null,
    });
    return id;
  } catch {
    return null;
  }
}

