/**
 * History timeline for a complaint.
 *
 * Renders the chronological audit trail. Per BE Stage 13.5 handoff:
 *  - `fromStatus` is null for the initial SUBMITTED row.
 *  - `changedByUserId` is null once the Stage 15 SLA scheduler starts
 *    flipping rows server-side.
 *
 * Display rules:
 *  - "Initial submission" label for the SUBMITTED bootstrap row.
 *  - "by system" when `changedByUserId` is null.
 *  - "by user #{id}" otherwise — staff names land alongside Stage 16's
 *    list endpoint (we'll plumb a /staff/by-id lookup then).
 */
import { useT } from '@complaints/i18n';
import { formatIstDateTime } from '@complaints/utils';
import type { Schemas } from '@complaints/api';
import { Badge } from '@/components/ui/badge';

export interface HistoryTimelineProps {
  entries: readonly Schemas.ComplaintHistoryEntryResponse[];
}

export function HistoryTimeline({ entries }: HistoryTimelineProps): React.JSX.Element {
  const t = useT();
  if (entries.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-500)]">
        {t('complaints.detail.historyEmpty')}
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((e) => {
        const initial = !e.fromStatus;
        const to = e.toStatus ?? '';
        return (
          <li
            key={e.id ?? `${e.changedAt}-${to}`}
            className="flex flex-col gap-1 border-l-2 border-[var(--color-muted-200)] pl-3"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {initial ? (
                <Badge tone="muted">{t('complaints.detail.historyInitial')}</Badge>
              ) : (
                <>
                  <Badge tone="muted">{statusLabel(t, e.fromStatus)}</Badge>
                  <span aria-hidden>→</span>
                  <Badge tone="success">{statusLabel(t, to)}</Badge>
                </>
              )}
            </div>
            <p className="text-xs text-[var(--color-muted-500)]">
              {e.changedAt ? formatIstDateTime(e.changedAt) : ''}{' '}
              {e.changedByUserId
                ? t('complaints.detail.historyChangedBy', { userId: e.changedByUserId })
                : t('complaints.detail.historySystem')}
            </p>
            {e.note ? <p className="text-sm">{e.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

function statusLabel(
  t: ReturnType<typeof useT>,
  status: string | null | undefined,
): string {
  if (!status) return '';
  const key = `complaints.status.${status}`;
  const v = t(key);
  return v === key ? status : v;
}

