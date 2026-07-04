/**
 * `pushRouteMap` — FE-owned `type → screen + params` map per
 * contract §4 ("No deep-link URL in the payload. FE owns the type →
 * screen + params map. The identifiers are everything needed for
 * routing").
 *
 * v1 reality: neither the staff complaint-detail screen nor the
 * consumer tracking screen have shipped on mobile yet. Every route
 * this map produces falls back to `/` (home) at navigation time
 * because expo-router will error on an unknown pathname. Callers
 * pass the resolved `params` regardless so a future stage adding the
 * real routes only needs to change values here, not the callsites.
 *
 * When staff/consumer detail routes land, swap the placeholder
 * pathnames below (marked TODO) for the real ones. The tests in
 * `pushRouteMap.test.ts` will surface the swap immediately.
 */
import type { ParsedPushFrame, PushEventType } from './pushFrame';

export interface PushRoute {
  pathname: string;
  params: Record<string, string>;
}

// Staff-scoped events land on the staff complaint-detail route once
// it exists (mobile roadmap post-21). Until then, fall through to `/`
// so the tap at least brings the app to the foreground.
const STAFF_DETAIL_PATHNAME = '/'; // TODO: '/staff/complaints/[id]' when it lands
const CONSUMER_LANDING_PATHNAME = '/(consumer)/landing';

/**
 * Consumer-scoped types: the mobile app has no consumer-side tracking
 * screen yet. The consumer must re-OTP to view any complaint, so we
 * route to the landing screen; a query hint lets a future consumer
 * tracking screen open the right ticket after re-verification.
 */
const CONSUMER_TYPES: ReadonlySet<PushEventType> = new Set([
  'COMPLAINT_RESOLVED',
  'COMPLAINT_CLOSED',
  'COMPLAINT_REJECTED',
]);

export function routeForPushFrame(frame: ParsedPushFrame): PushRoute {
  const isConsumer = CONSUMER_TYPES.has(frame.type);
  const pathname = isConsumer ? CONSUMER_LANDING_PATHNAME : STAFF_DETAIL_PATHNAME;
  return {
    pathname,
    params: {
      complaintId: frame.complaintId,
      ticketNo: frame.ticketNo,
      // `pushType` lets a future detail screen render a targeted
      // "we brought you here from an X notification" affordance
      // without another parse round trip.
      pushType: frame.type,
    },
  };
}

