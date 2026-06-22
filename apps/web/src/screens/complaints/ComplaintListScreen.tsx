/**
 * `/complaints` — engineer / admin paged list (BE Stage 16).
 *
 * Replaces the Stage 12 lookup-by-ID stub.
 *
 * Endpoint: `GET /api/v1/staff/complaints?…` via the hand-rolled
 * `useStaffComplaintsList`. Per BE handoff:
 *  - Engineer: server pins their DC; we omit `distributionCenterId`
 *    from the filter object even if a stale state value lingers.
 *  - Admin: optional `distributionCenterId` narrows within their
 *    subdivision; out-of-subdivision DC ids 403.
 *  - 403 → friendly empty state + `console.warn` (per handoff:
 *    "render empty state + console.warn (stale filter state)").
 *
 * Name resolution: collects unique `assignedEngineerId` and
 * `assignedTechnicianId` values across the visible page and resolves
 * via the Stage 14.5 batch `useGetStaffDirectoryMany`. Disabled actors
 * render muted.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { formatIstDateTime } from '@complaints/utils';
import { useAuthStore, selectStaff } from '@/auth/authStore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@complaints/api';
import {
  useStaffComplaintsList,
  type ComplaintFilters,
} from '@/features/complaints/listApi';
import { useStaffDirectoryByIds } from '@/features/staffDirectory/api';

const PAGE_SIZE = 20;
const STATUSES = [
  'SUBMITTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
  'REJECTED',
  'DUPLICATE',
] as const;
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;

type Status = (typeof STATUSES)[number];
type Severity = (typeof SEVERITIES)[number];

interface FilterState {
  q: string;
  status: Status | '';
  severity: Severity | '';
  slaBreached: '' | 'true' | 'false';
  categoryId: number | '';
  distributionCenterId: number | '';
  assignedTechnicianId: number | '';
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: FilterState = {
  q: '',
  status: '',
  severity: '',
  slaBreached: '',
  categoryId: '',
  distributionCenterId: '',
  assignedTechnicianId: '',
  dateFrom: '',
  dateTo: '',
};

export default function ComplaintListScreen(): React.JSX.Element {
  const t = useT();
  const staff = useAuthStore(selectStaff);
  const isAdmin = staff?.role === 'ADMIN';

  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);

  const filters: ComplaintFilters = useMemo(() => {
    const f: ComplaintFilters = {};
    if (applied.q) f.q = applied.q;
    if (applied.status) f.status = applied.status;
    if (applied.severity) f.severity = applied.severity;
    if (applied.slaBreached !== '') f.slaBreached = applied.slaBreached === 'true';
    if (applied.categoryId !== '') f.categoryId = applied.categoryId;
    // Engineer: do NOT send distributionCenterId — server pins it.
    if (isAdmin && applied.distributionCenterId !== '')
      f.distributionCenterId = applied.distributionCenterId;
    if (applied.assignedTechnicianId !== '')
      f.assignedTechnicianId = applied.assignedTechnicianId;
    if (applied.dateFrom) f.dateFrom = applied.dateFrom;
    if (applied.dateTo) f.dateTo = applied.dateTo;
    return f;
  }, [applied, isAdmin]);

  const query = useStaffComplaintsList({
    filters,
    pageable: { page, size: PAGE_SIZE, sort: ['createdAt,desc'] },
  });

  // Stage 16 handoff: out-of-scope DC filter for either role → 403.
  // Render empty state + console.warn so devs notice the stale filter.
  const isOutOfScope =
    query.isError &&
    query.error instanceof ApiError &&
    query.error.status === 403;
  useEffect(() => {
    if (isOutOfScope) {
      console.warn(
        '[complaints/list] 403 from /staff/complaints. Filter likely stale ' +
          '(out-of-scope DC for engineer / subdivision for admin).',
      );
    }
  }, [isOutOfScope]);

  const envelope = query.data?.data;
  const rows = useMemo(
    () => envelope?.data?.content ?? [],
    [envelope?.data?.content],
  );
  const totalPages = envelope?.data?.totalPages ?? 1;

  // Name resolution for assignee columns (BE Stage 14.5 / 16).
  const userIds = useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) {
      if (typeof r.assignedEngineerId === 'number') set.add(r.assignedEngineerId);
      if (typeof r.assignedTechnicianId === 'number') set.add(r.assignedTechnicianId);
    }
    return Array.from(set);
  }, [rows]);

  const directory = useStaffDirectoryByIds(userIds);
  const nameMap = useMemo(() => {
    const map = new Map<number, Schemas.StaffDirectoryEntryResponse>();
    for (const r of directory.data?.data?.data ?? []) {
      if (typeof r.userId === 'number') map.set(r.userId, r);
    }
    return map;
  }, [directory.data]);

  function applyDraft(): void {
    setPage(0);
    setApplied(draft);
  }
  function resetFilters(): void {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(0);
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold">{t('complaints.list.heading')}</h2>
          <p className="text-sm text-[var(--color-muted-500)]">
            {t('complaints.list.subheading')}
          </p>
        </div>
      </header>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          applyDraft();
        }}
      >
        <FilterField label={t('complaints.list.filters.q')} id="f-q" wide>
          <Input
            id="f-q"
            placeholder={t('complaints.list.filters.qPlaceholder')}
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
          />
        </FilterField>
        <FilterField label={t('complaints.list.filters.status')} id="f-status">
          <Select
            id="f-status"
            value={draft.status}
            onChange={(e) =>
              setDraft({ ...draft, status: e.target.value as Status | '' })
            }
          >
            <option value="">{t('common.all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`complaints.status.${s}`)}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label={t('complaints.list.filters.severity')} id="f-sev">
          <Select
            id="f-sev"
            value={draft.severity}
            onChange={(e) =>
              setDraft({ ...draft, severity: e.target.value as Severity | '' })
            }
          >
            <option value="">{t('common.all')}</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {t(`complaints.severity.${s}`)}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label={t('complaints.list.filters.slaBreached')} id="f-sla">
          <Select
            id="f-sla"
            value={draft.slaBreached}
            onChange={(e) =>
              setDraft({
                ...draft,
                slaBreached: e.target.value as FilterState['slaBreached'],
              })
            }
          >
            <option value="">{t('common.all')}</option>
            <option value="true">{t('common.yes')}</option>
            <option value="false">{t('common.no')}</option>
          </Select>
        </FilterField>
        <FilterField label={t('complaints.list.filters.categoryId')} id="f-cat">
          <Input
            id="f-cat"
            type="number"
            min={1}
            value={draft.categoryId}
            onChange={(e) =>
              setDraft({
                ...draft,
                categoryId: e.target.value === '' ? '' : Number(e.target.value),
              })
            }
            className="w-24"
          />
        </FilterField>
        {isAdmin ? (
          <FilterField label={t('complaints.list.filters.dc')} id="f-dc">
            <Input
              id="f-dc"
              type="number"
              min={1}
              value={draft.distributionCenterId}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  distributionCenterId:
                    e.target.value === '' ? '' : Number(e.target.value),
                })
              }
              className="w-24"
            />
          </FilterField>
        ) : null}
        <FilterField
          label={t('complaints.list.filters.assignedTechnicianId')}
          id="f-tech"
        >
          <Input
            id="f-tech"
            type="number"
            min={1}
            value={draft.assignedTechnicianId}
            onChange={(e) =>
              setDraft({
                ...draft,
                assignedTechnicianId:
                  e.target.value === '' ? '' : Number(e.target.value),
              })
            }
            className="w-24"
          />
        </FilterField>
        <FilterField label={t('complaints.list.filters.dateFrom')} id="f-from">
          <Input
            id="f-from"
            type="date"
            value={draft.dateFrom}
            onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })}
          />
        </FilterField>
        <FilterField label={t('complaints.list.filters.dateTo')} id="f-to">
          <Input
            id="f-to"
            type="date"
            value={draft.dateTo}
            onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
          />
        </FilterField>
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            {t('complaints.list.apply')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={resetFilters}>
            {t('complaints.list.reset')}
          </Button>
        </div>
      </form>

      {isOutOfScope ? (
        <Alert>
          <AlertTitle>{t('complaints.list.outOfScopeTitle')}</AlertTitle>
          <AlertDescription>{t('complaints.list.outOfScopeBody')}</AlertDescription>
        </Alert>
      ) : query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>{t('masterdata.common.errorTitle')}</AlertTitle>
          <AlertDescription>
            {query.error instanceof Error ? query.error.message : t('errors.generic')}
          </AlertDescription>
        </Alert>
      ) : null}

      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('complaints.list.cols.ticketNo')}</TableHead>
              <TableHead>{t('complaints.list.cols.status')}</TableHead>
              <TableHead>{t('complaints.list.cols.severity')}</TableHead>
              <TableHead>{t('complaints.list.cols.sla')}</TableHead>
              <TableHead>{t('complaints.list.cols.category')}</TableHead>
              {isAdmin ? (
                <TableHead>{t('complaints.list.cols.dc')}</TableHead>
              ) : null}
              <TableHead>{t('complaints.list.cols.engineer')}</TableHead>
              <TableHead>{t('complaints.list.cols.technician')}</TableHead>
              <TableHead>{t('complaints.list.cols.submittedAt')}</TableHead>
              <TableHead>{t('complaints.list.cols.deadline')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isAdmin ? 10 : 9}
                  className="text-center text-[var(--color-muted-500)]"
                >
                  {t('complaints.list.empty')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id ?? r.ticketNo}>
                  <TableCell>
                    {r.id !== undefined ? (
                      <Link
                        to={`/complaints/${r.id}`}
                        className="font-mono text-sm text-[var(--color-brand-700)] hover:underline"
                      >
                        {r.ticketNo ?? `#${r.id}`}
                      </Link>
                    ) : (
                      <span className="font-mono text-sm">{r.ticketNo ?? '—'}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge tone="success">
                      {r.status ? t(`complaints.status.${r.status}`) : '—'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.severity ? (
                      <Badge tone={r.severity === 'HIGH' ? 'danger' : 'muted'}>
                        {t(`complaints.severity.${r.severity}`)}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {r.slaBreached ? (
                      <Badge tone="danger">
                        {t('complaints.list.cols.slaYes')}
                      </Badge>
                    ) : (
                      <span className="text-xs text-[var(--color-muted-500)]">
                        {t('complaints.list.cols.slaNo')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{r.categoryId ?? '—'}</TableCell>
                  {isAdmin ? (
                    <TableCell>{r.distributionCenterId ?? '—'}</TableCell>
                  ) : null}
                  <TableCell>
                    <ActorCell id={r.assignedEngineerId} nameMap={nameMap} />
                  </TableCell>
                  <TableCell>
                    <ActorCell id={r.assignedTechnicianId} nameMap={nameMap} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.submittedAt ? formatIstDateTime(r.submittedAt) : '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.slaDeadline ? formatIstDateTime(r.slaDeadline) : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-[var(--color-muted-500)]">
          {t('common.page', { current: page + 1, total: Math.max(totalPages, 1) })}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          {t('common.previous')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={page + 1 >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          {t('common.next')}
        </Button>
      </div>
    </section>
  );
}

function FilterField({
  id,
  label,
  children,
  wide,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}): React.JSX.Element {
  return (
    <div className={`flex flex-col gap-1 ${wide ? 'min-w-[16rem] flex-1' : ''}`}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ActorCell({
  id,
  nameMap,
}: {
  id: number | undefined;
  nameMap: Map<number, Schemas.StaffDirectoryEntryResponse>;
}): React.JSX.Element {
  if (id === undefined || id === null) {
    return <span className="text-[var(--color-muted-500)]">—</span>;
  }
  const hit = nameMap.get(id);
  if (!hit) {
    return <span className="text-xs text-[var(--color-muted-500)]">#{id}</span>;
  }
  const muted = hit.enabled === false;
  const label = `${hit.fullName ?? ''} (${hit.employeeId ?? ''})`;
  return (
    <span className={`text-sm ${muted ? 'text-[var(--color-muted-500)] line-through' : ''}`}>
      {label}
    </span>
  );
}

