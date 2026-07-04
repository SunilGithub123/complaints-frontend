/**
 * Push-frame types + parser for Stage 21 FCM data messages.
 *
 * Wire schema is FROZEN per `docs/STAGE_21_DEVICE_TOKEN_CONTRACT.md` §4
 * — all values are strings (FCM data constraint), `schemaVersion="1"`.
 * Every event fanned out by the BE `AFTER_COMMIT` listeners lands
 * here.
 *
 * Two responsibilities:
 *
 *   1. **`schemaVersion` guard** — future BEs may bump this when the
 *      shape breaks. An installed app that predates the bump can't
 *      possibly parse the new shape; treat it as `unknown` and render
 *      the generic banner (never crash the app process).
 *   2. **Type narrowing** — the BE `type` enum is contract §5 and
 *      drives the route map. Anything not in the union → `unknown`.
 *
 * The parser is TOTAL — it never throws. FCM handlers run in a
 * background context on Android; an uncaught throw there gets the
 * app killed. Returning a discriminated `Result` keeps the callsite
 * boring.
 */

/** Contract §5 — the frozen v1 enum. Keep sorted for grep. */
export type PushEventType =
  | 'COMPLAINT_ASSIGNED'
  | 'COMPLAINT_CANCELLED'
  | 'COMPLAINT_CLOSED'
  | 'COMPLAINT_REASSIGNED'
  | 'COMPLAINT_REJECTED'
  | 'COMPLAINT_RESOLVED'
  | 'COMPLAINT_SUBMITTED'
  | 'FEEDBACK_RECEIVED'
  | 'SLA_BREACHED';

const KNOWN_TYPES: ReadonlySet<PushEventType> = new Set([
  'COMPLAINT_ASSIGNED',
  'COMPLAINT_CANCELLED',
  'COMPLAINT_CLOSED',
  'COMPLAINT_REASSIGNED',
  'COMPLAINT_REJECTED',
  'COMPLAINT_RESOLVED',
  'COMPLAINT_SUBMITTED',
  'FEEDBACK_RECEIVED',
  'SLA_BREACHED',
]);

export interface ParsedPushFrame {
  type: PushEventType;
  ticketNo: string;
  complaintId: string;
  title: string;
  body: string;
  eventOccurredAt: string;
  /** Always `"1"` for v1. */
  schemaVersion: string;
}

export type PushFrameResult =
  | { ok: true; frame: ParsedPushFrame }
  | { ok: false; reason: 'wrong-schema-version' | 'unknown-type' | 'missing-field' };

/** FCM hands us `Record<string, string | undefined>` — narrow at the door. */
export function parsePushFrame(
  data: Readonly<Record<string, string | undefined>> | null | undefined,
): PushFrameResult {
  if (!data) return { ok: false, reason: 'missing-field' };

  const schemaVersion = data.schemaVersion ?? '';
  if (schemaVersion !== '1') {
    // §4: bumped `schemaVersion` means the FE can't parse the new
    // shape. Older installs surface the generic banner; new installs
    // pick up the new parser on next release.
    return { ok: false, reason: 'wrong-schema-version' };
  }

  const type = data.type ?? '';
  if (!KNOWN_TYPES.has(type as PushEventType)) {
    return { ok: false, reason: 'unknown-type' };
  }

  const { ticketNo, complaintId, title, body, eventOccurredAt } = data;
  if (
    !ticketNo ||
    !complaintId ||
    !title ||
    !body ||
    !eventOccurredAt
  ) {
    return { ok: false, reason: 'missing-field' };
  }

  return {
    ok: true,
    frame: {
      type: type as PushEventType,
      ticketNo,
      complaintId,
      title,
      body,
      eventOccurredAt,
      schemaVersion,
    },
  };
}

