/**
 * pushFrame — 2 tests per the minimum-test policy.
 *
 *   1. Happy: a well-formed v1 frame parses into the typed shape
 *      with every field.
 *   2. Unhappy — schemaVersion guard: bumping schemaVersion to "2"
 *      returns the `wrong-schema-version` reject. This is the
 *      forward-compat contract §4 relies on — an older app must
 *      not crash when the BE ships a shape it can't parse.
 *
 * Field-guard coverage (missing ticketNo, unknown type) is implicit
 * — the branches are one-line early returns and would each add a
 * "renders without crashing"-flavour test the policy bans.
 */
import { parsePushFrame } from './pushFrame';

const validFrame: Record<string, string> = {
  type: 'COMPLAINT_ASSIGNED',
  ticketNo: 'MH20260600000007',
  complaintId: '7',
  title: 'New complaint assigned',
  body: 'Ticket MH20260600000007 - HIGH severity',
  eventOccurredAt: '2026-07-05T10:00:00+05:30',
  schemaVersion: '1',
};

describe('parsePushFrame', () => {
  it('parses a valid v1 frame into the typed shape', () => {
    const result = parsePushFrame(validFrame);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frame).toEqual({
      type: 'COMPLAINT_ASSIGNED',
      ticketNo: 'MH20260600000007',
      complaintId: '7',
      title: 'New complaint assigned',
      body: 'Ticket MH20260600000007 - HIGH severity',
      eventOccurredAt: '2026-07-05T10:00:00+05:30',
      schemaVersion: '1',
    });
  });

  it('rejects a frame whose schemaVersion the installed app does not know', () => {
    const result = parsePushFrame({ ...validFrame, schemaVersion: '2' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('wrong-schema-version');
  });
});

