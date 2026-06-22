/**
 * History timeline for a complaint.
 *
 * Renders the chronological audit trail. Per BE Stage 13.5 handoff:
 *  - `fromStatus` is null for the initial SUBMITTED row.
 *  - `changedByUserId` is null once the Stage 15 SLA scheduler starts
 *    flipping rows server-side → rendered as "by system".
 *
 * User-name resolution (BE Stage 14.5):
 *  - Collect the unique non-null `changedByUserId` values across all
 *    rows, issue ONE batch `GET /api/v1/staff/users?ids=…` via
 *    `useGetStaffDirectoryMany`. Cap is 50 ids per call — well above
 *    what any single complaint's timeline can reach today.
 *  - Render "by {fullName} ({employeeId})". If the id is missing from
 *    the response set (hard-deleted user — won't happen today, but
 *    the BE silently drops unknown ids, so defend against it) we fall
 *    back to the bare "by user #{id}" copy.
 *  - The TanStack query key (`getStaffDirectoryManyQueryKey`) is
 *    stable per ids-array so a refetch of the timeline that doesn't
 *    add a new actor reuses the cached batch.
 */
import { useMemo } from 'react';
import { type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { formatIstDateTime } from '@complaints/utils';
import { Badge } from '@/components/ui/badge';
import { useStaffDirectoryByIds } from '@/features/staffDirectory/api';

export interface HistoryTimelineProps {
  entries: readonly Schemas.ComplaintHistoryEntryResponse[];
}

export function HistoryTimeline({ entries }: HistoryTimelineProps): React.JSX.Element {
  const t = useT();

  // Unique list of actor ids. The hook sorts internally for a stable
  // cache key.
  const ids = useMemo(() => {
    const set = new Set<number>();
    for (const e of entries) {
      if (typeof e.changedByUserId === 'number') set.add(e.changedByUserId);
    }
    return Array.from(set);
  }, [entries]);

  // BE caps the batch at 50 ids. A single complaint's history is
  // comfortably below that; if/when we hit it we'll chunk + merge.
  const directory = useStaffDirectoryByIds(ids);

  const nameMap = useMemo(() => {
    const map = new Map<number, Schemas.StaffDirectoryEntryResponse>();
    const rows = directory.data?.data?.data ?? [];
    for (const r of rows) {
      if (typeof r.userId === 'number') map.set(r.userId, r);
    }
    return map;
  }, [directory.data]);

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
        const actor = describeActor(t, e.changedByUserId ?? null, nameMap);
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
              {e.changedAt ? formatIstDateTime(e.changedAt) : ''} {actor}
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

function describeActor(
  t: ReturnType<typeof useT>,
  userId: number | null,
  nameMap: Map<number, Schemas.StaffDirectoryEntryResponse>,
): string {
  if (userId === null) return t('complaints.detail.historySystem');
  const hit = nameMap.get(userId);
  if (hit && hit.fullName && hit.employeeId) {
    return t('complaints.detail.historyChangedBy', {
      name: hit.fullName,
      employeeId: hit.employeeId,
    });
  }
  // Either the batch hasn't resolved yet, or the user has been hard-
  // deleted (BE silently drops unknown ids). Fall back to the bare id
  // — better than a flash of "system" copy.
  return t('complaints.detail.historyChangedByUnknown', { userId });
}

