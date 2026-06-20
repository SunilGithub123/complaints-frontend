/**
 * IST timezone constant — must be used by every business date helper.
 * Mirrors backend `DateUtils.IST` (see ../../../complaints/docs/TECHNICAL_DESIGN.md §16.1).
 */
export const IST_TIMEZONE = 'Asia/Kolkata';

/** Format an ISO timestamp in IST (en-IN locale). Real formatters land per-feature. */
export function formatIstDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { timeZone: IST_TIMEZONE });
}

