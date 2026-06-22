/**
 * `/complaints/:id` — engineer/admin complaint detail.
 *
 * Renders:
 *  - Header with ticket no, status, severity, SLA breach badge.
 *  - Body: description, location, category, DC, consumer info, images.
 *  - Reason fields (rejection / cancellation / SLA breach / resolution
 *    notes) shown only when present.
 *  - Action bar gated by status:
 *      SUBMITTED   → Assign, Reject, Mark-Duplicate
 *      ASSIGNED, IN_PROGRESS, RESOLVED → Reassign, Update severity
 *      terminal (CLOSED, CANCELLED, REJECTED, DUPLICATE) → none
 *  - History timeline.
 *
 * Error handling:
 *  - 403 → "outside your scope" friendly empty state (per BE handoff:
 *    expect COMPLAINT_OUT_OF_SCOPE; render an empty state, NOT a hard
 *    error).
 *  - 404 → "not found" empty state.
 *  - Other → generic alert.
 *
 * Optimistic-concurrency `version` is plumbed through but NOT enforced
 * yet (per BE handoff: ignore for now, used in a later slice).
 *
 * Gated by RequireRole=['ADMIN','ENGINEER'] at the router level.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetStaffComplaintById,
  useGetStaffComplaintHistory,
  getStaffComplaintByIdQueryKey,
  getStaffComplaintHistoryQueryKey,
  ApiError,
  type Schemas,
} from '@complaints/api';
import { useT } from '@complaints/i18n';
import { formatIstDateTime } from '@complaints/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { mapApiError } from '@/lib/apiErrors';
import { HistoryTimeline } from './HistoryTimeline';
import { AssignDialog } from './AssignDialog';
import { ReassignDialog } from './ReassignDialog';
import { SeverityDialog } from './SeverityDialog';
import { RejectDialog } from './RejectDialog';
import { MarkDuplicateDialog } from './MarkDuplicateDialog';
import { CloseDialog } from './CloseDialog';

type Status = NonNullable<Schemas.ComplaintStaffDetailResponse['status']>;
type Severity = NonNullable<Schemas.ComplaintStaffDetailResponse['severity']>;

const TERMINAL: readonly Status[] = ['CLOSED', 'CANCELLED', 'REJECTED', 'DUPLICATE'];

type DialogKind =
  | 'assign'
  | 'reassign'
  | 'severity'
  | 'reject'
  | 'duplicate'
  | 'close'
  | null;

export default function ComplaintDetailScreen(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { show: toast } = useToast();
  const [dialog, setDialog] = useState<DialogKind>(null);

  // BE Stage 16.1 bumped the signed-image-URL TTL from 15 min → 1 h, so
  // we no longer need `staleTime: 0` to keep gallery thumbnails alive.
  // 30 min leaves a comfortable safety margin under the 1 h TTL while
  // still feeling fresh on a tab the user revisits.
  const detail = useGetStaffComplaintById<
    { data?: Schemas.ApiResponseComplaintStaffDetailResponse },
    unknown
  >(id, {
    query: {
      retry: false,
      enabled: Number.isFinite(id) && id > 0,
      staleTime: 30 * 60_000,
    },
  });
  const history = useGetStaffComplaintHistory<
    { data?: Schemas.ApiResponseListComplaintHistoryEntryResponse },
    unknown
  >(id, { query: { retry: false, enabled: Number.isFinite(id) && id > 0 } });

  const view = detail.data?.data?.data;
  const historyRows = history.data?.data?.data ?? [];

  function refetch(opts?: { skipDetail?: boolean }): void {
    if (!opts?.skipDetail) {
      void queryClient.invalidateQueries({
        queryKey: getStaffComplaintByIdQueryKey(id),
      });
    }
    void queryClient.invalidateQueries({
      queryKey: getStaffComplaintHistoryQueryKey(id),
    });
  }

  function onActionSuccess(
    toastKey: string,
    opts?: { skipDetailRefetch?: boolean },
  ): void {
    setDialog(null);
    toast(t(toastKey), 'success');
    refetch({ skipDetail: opts?.skipDetailRefetch });
  }

  // --- Error states --------------------------------------------------
  if (detail.isError) {
    const err = detail.error;
    const status = err instanceof ApiError ? err.status : null;
    if (status === 403) {
      return (
        <EmptyState
          title={t('complaints.detail.outOfScopeTitle')}
          body={t('complaints.detail.outOfScopeBody')}
          onBack={() => navigate('/complaints')}
          backLabel={t('complaints.detail.back')}
        />
      );
    }
    if (status === 404) {
      return (
        <EmptyState
          title={t('complaints.detail.notFoundTitle')}
          body={t('complaints.detail.notFoundBody')}
          onBack={() => navigate('/complaints')}
          backLabel={t('complaints.detail.back')}
        />
      );
    }
    return (
      <section className="flex max-w-2xl flex-col gap-3">
        <Alert variant="destructive">
          <AlertTitle>{t('errors.title')}</AlertTitle>
          <AlertDescription>{mapApiError(err, t).message}</AlertDescription>
        </Alert>
        <div>
          <Button variant="ghost" onClick={() => navigate('/complaints')}>
            {t('complaints.detail.back')}
          </Button>
        </div>
      </section>
    );
  }

  if (detail.isLoading || !view) {
    return (
      <section className="flex max-w-3xl flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </section>
    );
  }

  const status = (view.status ?? 'SUBMITTED') as Status;
  const severity = (view.severity ?? null) as Severity | null;
  const isTerminal = TERMINAL.includes(status);
  const canAssign = status === 'SUBMITTED';
  const canReject = status === 'SUBMITTED';
  const canMarkDuplicate = status === 'SUBMITTED';
  const canReassign =
    status === 'ASSIGNED' || status === 'IN_PROGRESS' || status === 'RESOLVED';
  const canEditSeverity = canReassign;
  // Close-on-behalf (BE Stage 14) — engineer/admin only, RESOLVED only.
  // Role gate is enforced at the route level (RequireRole ADMIN+ENGINEER).
  const canClose = status === 'RESOLVED';

  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate('/complaints')}>
            ← {t('complaints.detail.back')}
          </Button>
          <h2 className="text-2xl font-semibold">
            {t('complaints.detail.ticket')}{' '}
            <span className="font-mono">{view.ticketNo ?? `#${view.id ?? id}`}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">{t(`complaints.status.${status}`)}</Badge>
            {severity ? (
              <Badge tone={severity === 'HIGH' ? 'danger' : 'muted'}>
                {t(`complaints.severity.${severity}`)}
              </Badge>
            ) : null}
            {view.slaBreached ? (
              <Badge tone="danger">{t('complaints.detail.slaBreached')}</Badge>
            ) : null}
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('complaints.detail.description')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="whitespace-pre-wrap text-sm">{view.description ?? '—'}</p>

          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Field label={t('complaints.detail.category')}>{view.categoryId ?? '—'}</Field>
            <Field label={t('complaints.detail.distributionCenter')}>
              {view.distributionCenterId ?? '—'}
            </Field>
            <Field label={t('complaints.detail.consumerMaster')}>
              {view.consumerMasterId ?? '—'}
            </Field>
            <Field label={t('complaints.detail.contactMobile')}>
              {view.contactMobile ?? '—'}
            </Field>
            <Field label={t('complaints.detail.assignedEngineer')}>
              {view.assignedEngineerId ?? '—'}
            </Field>
            <Field label={t('complaints.detail.assignedTechnician')}>
              {view.assignedTechnicianId ?? '—'}
            </Field>
            <Field label={t('complaints.detail.location')}>
              {view.location ?? '—'}
            </Field>
            <Field label={t('complaints.detail.parent')}>
              {view.parentComplaintId ?? '—'}
            </Field>
            <Field label={t('complaints.detail.submittedAt')}>
              {view.submittedAt ? formatIstDateTime(view.submittedAt) : '—'}
            </Field>
            <Field label={t('complaints.detail.updatedAt')}>
              {view.updatedAt ? formatIstDateTime(view.updatedAt) : '—'}
            </Field>
            <Field label={t('complaints.detail.slaDeadline')}>
              {view.slaDeadline ? formatIstDateTime(view.slaDeadline) : '—'}
            </Field>
            <Field label={t('complaints.detail.resolvedAt')}>
              {view.resolvedAt ? formatIstDateTime(view.resolvedAt) : '—'}
            </Field>
            <Field label={t('complaints.detail.closedAt')}>
              {view.closedAt ? formatIstDateTime(view.closedAt) : '—'}
            </Field>
          </dl>

          {hasAnyReason(view) ? (
            <section className="flex flex-col gap-2 border-t border-[var(--color-muted-200)] pt-3">
              <h3 className="text-sm font-medium">{t('complaints.detail.reasons')}</h3>
              {view.rejectionReason ? (
                <ReasonRow
                  label={t('complaints.detail.rejectionReason')}
                  value={view.rejectionReason}
                />
              ) : null}
              {view.cancellationReason ? (
                <ReasonRow
                  label={t('complaints.detail.cancellationReason')}
                  value={view.cancellationReason}
                />
              ) : null}
              {view.slaBreachReason ? (
                <ReasonRow
                  label={t('complaints.detail.slaBreachReason')}
                  value={view.slaBreachReason}
                />
              ) : null}
              {view.resolutionNotes ? (
                <ReasonRow
                  label={t('complaints.detail.resolutionNotes')}
                  value={view.resolutionNotes}
                />
              ) : null}
            </section>
          ) : null}

          <section className="flex flex-col gap-2 border-t border-[var(--color-muted-200)] pt-3">
            <h3 className="text-sm font-medium">{t('complaints.detail.images')}</h3>
            {view.images && view.images.length > 0 ? (
              <ImageGallery images={view.images} t={t} />
            ) : (
              <p className="text-sm text-[var(--color-muted-500)]">
                {t('complaints.detail.noImages')}
              </p>
            )}
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('complaints.detail.actions.heading')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isTerminal ? (
            <p className="text-sm text-[var(--color-muted-500)]">
              {t('complaints.detail.actions.noneTerminal')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {canAssign ? (
                <Button onClick={() => setDialog('assign')}>
                  {t('complaints.detail.actions.assign')}
                </Button>
              ) : null}
              {canReassign ? (
                <Button onClick={() => setDialog('reassign')}>
                  {t('complaints.detail.actions.reassign')}
                </Button>
              ) : null}
              {canEditSeverity ? (
                <Button variant="secondary" onClick={() => setDialog('severity')}>
                  {t('complaints.detail.actions.severity')}
                </Button>
              ) : null}
              {canClose ? (
                <Button onClick={() => setDialog('close')}>
                  {t('complaints.detail.actions.close')}
                </Button>
              ) : null}
              {canReject ? (
                <Button variant="secondary" onClick={() => setDialog('reject')}>
                  {t('complaints.detail.actions.reject')}
                </Button>
              ) : null}
              {canMarkDuplicate ? (
                <Button variant="ghost" onClick={() => setDialog('duplicate')}>
                  {t('complaints.detail.actions.markDuplicate')}
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('complaints.detail.historyHeading')}</CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <HistoryTimeline entries={historyRows} />
          )}
        </CardContent>
      </Card>

      {view.distributionCenterId !== undefined && view.id !== undefined ? (
        <>
          <AssignDialog
            open={dialog === 'assign'}
            onClose={() => setDialog(null)}
            complaintId={view.id}
            distributionCenterId={view.distributionCenterId}
            onSuccess={() => onActionSuccess('complaints.assign.successToast')}
          />
          <ReassignDialog
            open={dialog === 'reassign'}
            onClose={() => setDialog(null)}
            complaintId={view.id}
            distributionCenterId={view.distributionCenterId}
            currentTechnicianId={view.assignedTechnicianId ?? null}
            onSuccess={() => onActionSuccess('complaints.reassign.successToast')}
          />
          <SeverityDialog
            open={dialog === 'severity'}
            onClose={() => setDialog(null)}
            complaintId={view.id}
            current={severity}
            onSuccess={() => onActionSuccess('complaints.severityDialog.successToast')}
          />
          <RejectDialog
            open={dialog === 'reject'}
            onClose={() => setDialog(null)}
            complaintId={view.id}
            onSuccess={() => onActionSuccess('complaints.reject.successToast')}
          />
          <MarkDuplicateDialog
            open={dialog === 'duplicate'}
            onClose={() => setDialog(null)}
            complaintId={view.id}
            ownTicketNo={view.ticketNo ?? null}
            onSuccess={() => onActionSuccess('complaints.markDuplicate.successToast')}
          />
          <CloseDialog
            open={dialog === 'close'}
            onClose={() => setDialog(null)}
            complaintId={view.id}
            slaBreached={view.slaBreached === true}
            existingSlaBreachReason={view.slaBreachReason ?? null}
            onSuccess={(detail: Schemas.ComplaintStaffDetailResponse | undefined) => {
              // BE Stage 16.1 — `close` now returns the post-close
              // detail. Seed the cache directly so we don't refetch.
              if (detail) {
                queryClient.setQueryData(getStaffComplaintByIdQueryKey(view.id!), {
                  data: { success: true, data: detail },
                } satisfies { data: Schemas.ApiResponseComplaintStaffDetailResponse });
              }
              onActionSuccess('complaints.close.successToast', {
                skipDetailRefetch: detail !== undefined,
              });
            }}
          />
        </>
      ) : null}
    </section>
  );
}

function hasAnyReason(v: Schemas.ComplaintStaffDetailResponse): boolean {
  return !!(
    v.rejectionReason ||
    v.cancellationReason ||
    v.slaBreachReason ||
    v.resolutionNotes
  );
}

/**
 * Renders the complaint's images grouped by `imageType` (BE Stage 16.1).
 *
 * - `COMPLAINT` images (consumer-submitted) → top group.
 * - `RESOLUTION` images (technician proof-of-fix) → bottom group.
 *
 * BE Stage 19.x confirmed `imageType` is required-non-null on every
 * response, so the previously-defensive "untyped" bucket has been
 * removed. Inside each group, images are sorted by `uploadedAt` ASC
 * for a stable, chronological gallery.
 */
function ImageGallery({
  images,
  t,
}: {
  images: Schemas.ComplaintImageResponse[];
  t: (key: string) => string;
}): React.JSX.Element {
  const byTime = (
    a: Schemas.ComplaintImageResponse,
    b: Schemas.ComplaintImageResponse,
  ): number => (a.uploadedAt ?? '').localeCompare(b.uploadedAt ?? '');
  const consumer = images.filter((i) => i.imageType === 'COMPLAINT').sort(byTime);
  const resolution = images
    .filter((i) => i.imageType === 'RESOLUTION')
    .sort(byTime);

  return (
    <div className="flex flex-col gap-4" data-testid="complaint-gallery">
      {consumer.length > 0 ? (
        <ImageGroup
          heading={t('complaints.detail.imagesConsumer')}
          images={consumer}
          testId="complaint-gallery-consumer"
        />
      ) : null}
      {resolution.length > 0 ? (
        <ImageGroup
          heading={t('complaints.detail.imagesResolution')}
          images={resolution}
          testId="complaint-gallery-resolution"
        />
      ) : null}
    </div>
  );
}

function ImageGroup({
  heading,
  images,
  testId,
}: {
  heading: string;
  images: Schemas.ComplaintImageResponse[];
  testId: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-xs uppercase tracking-wide text-[var(--color-muted-500)]">
        {heading}
      </h4>
      <ul className="grid grid-cols-3 gap-2" data-testid={testId}>
        {images.map((img) => (
          <li
            key={img.id ?? img.url}
            className="overflow-hidden rounded-md border border-[var(--color-muted-200)]"
          >
            {img.url ? (
              <img
                src={img.url}
                alt=""
                loading="lazy"
                className="h-24 w-full object-cover"
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-500)]">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function ReasonRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-500)]">
        {label}
      </dt>
      <dd className="whitespace-pre-wrap text-sm">{value}</dd>
    </div>
  );
}

function EmptyState({
  title,
  body,
  onBack,
  backLabel,
}: {
  title: string;
  body: string;
  onBack: () => void;
  backLabel: string;
}): React.JSX.Element {
  return (
    <section className="flex max-w-xl flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-[var(--color-muted-500)]">{body}</p>
          <div>
            <Button variant="ghost" onClick={onBack}>
              {backLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
