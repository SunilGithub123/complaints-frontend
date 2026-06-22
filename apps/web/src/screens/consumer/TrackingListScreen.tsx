/**
 * `/consumer/my-complaints` — paged tracking list (BE Stage 17).
 *
 * Gated by the consumer-verify guard (5-min OTP JWT). Shows every
 * complaint the verified consumer has raised, ordered newest-first by
 * BE default (we deliberately don't append `?sort=`).
 *
 * Filters: just the status dropdown for v1 — date / category filters
 * land when the BE adds them.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { formatIstDateTime } from '@complaints/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { mapApiError } from '@/lib/apiErrors';
import { useConsumerComplaintsList } from '@/features/consumer/trackingApi';
import { useConsumerAuthStore } from '@/features/consumer/consumerAuthStore';

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
type Status = (typeof STATUSES)[number];

export default function TrackingListScreen(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<Status | ''>('');

  const query = useConsumerComplaintsList({
    page,
    size: PAGE_SIZE,
    ...(status ? { status } : {}),
  });

  // 401 means the 5-min OTP window closed mid-session. Clear the
  // store + bounce back to landing so the consumer can re-verify.
  if (
    query.isError &&
    query.error instanceof ApiError &&
    query.error.status === 401
  ) {
    useConsumerAuthStore.getState().clear();
    navigate('/consumer', { replace: true });
  }

  const envelope = query.data?.data;
  const rows = envelope?.data?.content ?? [];
  const totalPages = envelope?.data?.totalPages ?? 1;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('consumer.tracking.heading')}</h1>
          <p className="text-sm text-[var(--color-muted-500)]">
            {t('consumer.tracking.subheading')}
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate('/consumer')}>
          {t('consumer.tracking.lodgeAnother')}
        </Button>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tracking-status">{t('consumer.tracking.status')}</Label>
          <Select
            id="tracking-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status | '');
              setPage(0);
            }}
          >
            <option value="">{t('consumer.tracking.statusAny')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`complaints.status.${s}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>{t('errors.title')}</AlertTitle>
          <AlertDescription>{mapApiError(query.error, t).message}</AlertDescription>
        </Alert>
      ) : null}

      {query.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 && !query.isError ? (
        <p className="text-sm text-[var(--color-muted-500)]">
          {t('consumer.tracking.empty')}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('consumer.tracking.ticket')}</TableHead>
                <TableHead>{t('consumer.tracking.statusCol')}</TableHead>
                <TableHead>{t('consumer.tracking.submitted')}</TableHead>
                <TableHead>{t('consumer.tracking.deadline')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <Row key={r.id ?? r.ticketNo} row={r} t={t} />
              ))}
            </TableBody>
          </Table>

          <nav className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              {t('consumer.tracking.prev')}
            </Button>
            <span className="text-sm text-[var(--color-muted-500)]">
              {t('consumer.tracking.pageOf', {
                page: page + 1,
                total: Math.max(1, totalPages),
              })}
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPage((p) => p + 1)}
              disabled={page + 1 >= totalPages}
            >
              {t('consumer.tracking.next')}
            </Button>
          </nav>
        </>
      )}
    </main>
  );
}

function Row({
  row,
  t,
}: {
  row: Schemas.ConsumerComplaintListItemResponse;
  t: ReturnType<typeof useT>;
}): React.JSX.Element {
  const status = row.status ?? 'SUBMITTED';
  return (
    <TableRow>
      <TableCell>
        {row.ticketNo ? (
          <Link
            to={`/consumer/my-complaints/${encodeURIComponent(row.ticketNo)}`}
            className="font-mono text-[var(--color-brand-600)] hover:underline"
          >
            {row.ticketNo}
          </Link>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Badge tone="success">{t(`complaints.status.${status}`)}</Badge>
          {row.slaBreached ? (
            <Badge tone="danger">{t('consumer.tracking.slaBreached')}</Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell>{row.submittedAt ? formatIstDateTime(row.submittedAt) : '—'}</TableCell>
      <TableCell>{row.slaDeadline ? formatIstDateTime(row.slaDeadline) : '—'}</TableCell>
    </TableRow>
  );
}


