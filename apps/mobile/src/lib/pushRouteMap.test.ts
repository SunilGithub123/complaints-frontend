/**
 * pushRouteMap — 2 tests per the minimum-test policy.
 *
 *   1. Staff-scoped event → staff-detail placeholder pathname + the
 *      identifiers surfaced as params.
 *   2. Consumer-scoped event → consumer-landing pathname (per v1
 *      "no consumer tracking screen yet") + the same identifier
 *      params.
 *
 * Both tests will need a one-line update when the real detail
 * screens land in a post-21 stage — that's the whole point.
 */
import type { ParsedPushFrame } from './pushFrame';
import { routeForPushFrame } from './pushRouteMap';

function frame(
  overrides: Partial<ParsedPushFrame>,
): ParsedPushFrame {
  return {
    type: 'COMPLAINT_ASSIGNED',
    ticketNo: 'MH20260600000007',
    complaintId: '7',
    title: 'New complaint assigned',
    body: 'Ticket MH20260600000007 - HIGH severity',
    eventOccurredAt: '2026-07-05T10:00:00+05:30',
    schemaVersion: '1',
    ...overrides,
  };
}

describe('routeForPushFrame', () => {
  it('routes a staff-scoped COMPLAINT_ASSIGNED to the staff detail placeholder with identifier params', () => {
    const route = routeForPushFrame(frame({ type: 'COMPLAINT_ASSIGNED' }));
    // Placeholder for v1 — home. Update this assertion when the
    // real staff/complaints/[id] route lands (see pushRouteMap.ts).
    expect(route.pathname).toBe('/');
    expect(route.params).toEqual({
      complaintId: '7',
      ticketNo: 'MH20260600000007',
      pushType: 'COMPLAINT_ASSIGNED',
    });
  });

  it('routes a consumer-scoped COMPLAINT_CLOSED to the consumer landing screen', () => {
    const route = routeForPushFrame(frame({ type: 'COMPLAINT_CLOSED' }));
    expect(route.pathname).toBe('/(consumer)/landing');
    expect(route.params.pushType).toBe('COMPLAINT_CLOSED');
  });
});

