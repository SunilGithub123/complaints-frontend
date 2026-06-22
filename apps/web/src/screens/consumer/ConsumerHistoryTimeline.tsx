/**
 * Consumer-facing history timeline (BE Stage 17).
 *
 * Mirrors the staff `HistoryTimeline` but with two differences:
 *  - No `changedByUserId` field on the BE response (privacy: the
 *    consumer doesn't see staff identities), so no batch directory
 *    lookup. Each row is just from/to status + note + timestamp.
 *  - Smaller status set in practice (consumer-visible transitions
 *    only) but we keep the same i18n `complaints.status.*` keys.
 */
import { type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { formatIstDateTime } from '@complaints/utils';
import { Badge } from '@/components/ui/badge';

export interface ConsumerHistoryTimelineProps {
  entries: readonly Schemas.ConsumerComplaintHistoryEntryResponse[];
}

export function ConsumerHistoryTimeline({
  entries,
}: ConsumerHistoryTimelineProps): React.JSX.Element {
  const t = useT();

  if (entries.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-500)]">
        {t('consumer.detail.historyEmpty')}
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
                <Badge tone="muted">{t('consumer.detail.historyInitial')}</Badge>
              ) : (
                <>
                  <Badge tone="muted">{statusLabel(t, e.fromStatus)}</Badge>
                  <span aria-hidden>→</span>
                  <Badge tone="success">{statusLabel(t, to)}</Badge>
                </>
              )}
            </div>
            <p className="text-xs text-[var(--color-muted-500)]">
              {e.changedAt ? formatIstDateTime(e.changedAt) : ''}
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

