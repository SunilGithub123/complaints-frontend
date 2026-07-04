/**
 * `wirePushHandlers` — boot-time registration of the three FCM
 * message-handler surfaces per contract §4 / §5:
 *
 *   1. `messaging().setBackgroundMessageHandler(cb)` — called by the
 *      OS when a data-only FCM frame arrives with the app killed /
 *      backgrounded. Must be registered at module scope so RN
 *      Firebase can hand the OS a handler reference even when JS is
 *      cold; that's why we call it inside `wirePushHandlers()` which
 *      itself is invoked at module load from `_layout.tsx`.
 *   2. `messaging().onMessage(cb)` — foreground counterpart. FCM
 *      data-only frames don't auto-render a banner in the foreground
 *      on either platform; local-banner display via
 *      `expo-notifications` lands in a follow-up (see carry-over) so
 *      v1 just parses + logs.
 *   3. `messaging().onNotificationOpenedApp(cb)` — tap while
 *      backgrounded → navigate via the FE-owned route map.
 *      `messaging().getInitialNotification()` covers the cold-start
 *      tap path once.
 *
 * Guarded on `EXPO_PUBLIC_ENABLE_PUSH === 'true'` so dev builds
 * without RN Firebase credentials (see credentials/README.md) don't
 * touch the native module. When disabled, this function is a no-op
 * and the stub `PushProvider` keeps running — no messages arrive
 * anyway.
 *
 * Frame parsing uses `parsePushFrame` — total, never throws. A
 * malformed / unknown-schema-version frame is logged and dropped;
 * the caller flow (background delivery, foreground display, tap
 * navigation) fails soft.
 *
 * Console output is INFO-level only and mirrors contract §6.2
 * never-log rules: the frame's `title`/`body` MAY contain PII in
 * future stages, so we log only `type`, `ticketNo`, `complaintId`.
 * Sentry `beforeSend` scrubbing lands in Phase 7.
 */
import { router } from 'expo-router';
import messaging from '@react-native-firebase/messaging';

import { parsePushFrame, type ParsedPushFrame } from './pushFrame';
import { routeForPushFrame } from './pushRouteMap';

/**
 * Safe navigator: expo-router types the `push` argument against the
 * generated route union. The push route map returns pathnames that
 * may or may not exist yet (see `pushRouteMap.ts`). Wrap in a
 * try/catch and fall back to `/` so a tap never strands the user on
 * a blank screen.
 */
function safeNavigate(frame: ParsedPushFrame): void {
  const { pathname, params } = routeForPushFrame(frame);
  try {
    router.push({ pathname: pathname as never, params });
  } catch {
    try {
      router.push('/');
    } catch {
      // Router not yet initialised (called before the first navigator
      // renders — e.g. cold-start tap). expo-router queues the next
      // `push` call once ready, but if that too fails we let the app
      // land on its default route.
    }
  }
}

function logFrameResult(
  source: 'background' | 'foreground' | 'tap',
  raw: Readonly<Record<string, string | undefined>> | null | undefined,
): ParsedPushFrame | null {
  const result = parsePushFrame(raw);
  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.info(`[push:${source}] dropped frame`, { reason: result.reason });
    return null;
  }
  // eslint-disable-next-line no-console
  console.info(`[push:${source}] frame`, {
    type: result.frame.type,
    ticketNo: result.frame.ticketNo,
    complaintId: result.frame.complaintId,
    // Deliberately omit title/body/eventOccurredAt per §6.2.
  });
  return result.frame;
}

/**
 * Register the three handlers. Idempotent: repeat calls replace the
 * previous handlers (RN Firebase's contract). Called once at boot,
 * but nothing breaks if a test double-invokes.
 */
export function wirePushHandlers(): void {
  if (process.env.EXPO_PUBLIC_ENABLE_PUSH !== 'true') return;

  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    logFrameResult('background', remoteMessage.data as
      | Record<string, string | undefined>
      | undefined);
    // §4: data-only frames — no OS display in background either. A
    // future slice can call `expo-notifications` here to schedule a
    // heads-up notification even though the JS was warm-started.
  });

  messaging().onMessage(async (remoteMessage) => {
    logFrameResult('foreground', remoteMessage.data as
      | Record<string, string | undefined>
      | undefined);
  });

  messaging().onNotificationOpenedApp((remoteMessage) => {
    const frame = logFrameResult('tap', remoteMessage.data as
      | Record<string, string | undefined>
      | undefined);
    if (frame) safeNavigate(frame);
  });

  // Cold-start tap: the notification that woke the app. Runs once.
  void messaging()
    .getInitialNotification()
    .then((remoteMessage) => {
      if (!remoteMessage) return;
      const frame = logFrameResult('tap', remoteMessage.data as
        | Record<string, string | undefined>
        | undefined);
      if (frame) safeNavigate(frame);
    })
    .catch(() => {
      // No-op — nothing to navigate to.
    });
}

