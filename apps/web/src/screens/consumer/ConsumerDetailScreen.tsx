/**
 * `/consumer/my-complaints/:ticketNo` — consumer-facing detail screen
 * (BE Stage 17 enriched detail + Stage 18 cancel + Stage 19 feedback,
 * Stage 19.x added `feedbackSubmitted` boolean + GET /feedback).
 *
 * Renders the enriched `ComplaintDetailResponse` (severity, slaBreached,
 * resolvedAt, closedAt, feedbackSubmitted). Plus:
 *  - History timeline from `useGetConsumerComplaintHistory`.
 *  - Cancel button (status === 'SUBMITTED' only).
 *  - Feedback action:
 *      feedbackSubmitted === false → "Leave feedback" button → dialog.
 *      feedbackSubmitted === true  → read-only panel via
 *                                    `useGetFeedback`.
 *    BE contract: GET /feedback returns 200 with `data: null` in the
 *    rare race window between detail and GET; we treat it as
 *    "not yet rendered" and let the next tick refetch. NOT a 404.
 *
 * Error states:
 *  - 401 → clear consumer store, bounce to /consumer.
 *  - 403 → not-yours empty state (same copy as ConfirmationScreen).
 *  - Other → generic alert.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetComplaintByTicket,
  useGetConsumerComplaintHistory,
  useGetFeedback,
  getGetComplaintByTicketQueryKey,
  getConsumerComplaintHistoryQueryKey,
  getGetFeedbackQueryKey,
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
import { useConsumerAuthStore } from '@/features/consumer/consumerAuthStore';
import { mapApiError } from '@/lib/apiErrors';
import { ConsumerHistoryTimeline } from './ConsumerHistoryTimeline';
import { CancelDialog } from './CancelDialog';
import { FeedbackDialog } from './FeedbackDialog';

type DialogKind = 'cancel' | 'feedback' | null;

export default function ConsumerDetailScreen(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const params = useParams<{ ticketNo: string }>();
  const ticketNo = params.ticketNo ?? '';
  const queryClient = useQueryClient();
  const { show: toast } = useToast();
  const [dialog, setDialog] = useState<DialogKind>(null);

  const detail = useGetComplaintByTicket<
    { data?: Schemas.ApiResponseComplaintDetailResponse },
    unknown
  >(ticketNo, {
    query: {
      retry: false,
      enabled: ticketNo.length > 0,
    },
  });
  const history = useGetConsumerComplaintHistory<
    { data?: Schemas.ApiResponseListConsumerComplaintHistoryEntryResponse },
    unknown
  >(ticketNo, {
    query: {
      retry: false,
      enabled: ticketNo.length > 0,
    },
  });

  const view = detail.data?.data?.data;
  const historyRows = history.data?.data?.data ?? [];
  const feedbackSubmitted = view?.feedbackSubmitted === true;

  // Only fetch the persisted feedback when the detail says it exists.
  // BE returns 200 with `data: null` if the row hasn't propagated yet —
  // treat that as "not yet" rather than an error (no try/catch needed).
  const feedback = useGetFeedback<
    { data?: Schemas.ApiResponseFeedbackResponse },
    unknown
  >(ticketNo, {
    query: {
      retry: false,
      enabled: ticketNo.length > 0 && feedbackSubmitted,
    },
  });
  const feedbackRow = feedback.data?.data?.data ?? null;

  // 401 anywhere → consumer JWT expired mid-session.
  useEffect(() => {
    const isAuthErr = (e: unknown): boolean =>
      e instanceof ApiError && e.status === 401;
    if (isAuthErr(detail.error) || isAuthErr(history.error)) {
      useConsumerAuthStore.getState().clear();
      navigate('/consumer', { replace: true });
    }
  }, [detail.error, history.error, navigate]);

  function invalidate(opts?: { feedback?: boolean }): void {
    void queryClient.invalidateQueries({
      queryKey: getGetComplaintByTicketQueryKey(ticketNo),
    });
    void queryClient.invalidateQueries({
      queryKey: getConsumerComplaintHistoryQueryKey(ticketNo),
    });
    if (opts?.feedback) {
      void queryClient.invalidateQueries({
        queryKey: getGetFeedbackQueryKey(ticketNo),
      });
    }
  }

  // --- Error states --------------------------------------------------
  if (detail.isError) {
    const status =
      detail.error instanceof ApiError ? detail.error.status : null;
    if (status === 403) {
      return (
        <EmptyState
          title={t('consumer.confirmation.notYoursTitle')}
          body={t('consumer.confirmation.notYoursBody')}
          onBack={() => navigate('/consumer')}
          backLabel={t('consumer.detail.back')}
        />
      );
    }
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-3 p-4">
        <Alert variant="destructive">
          <AlertTitle>{t('errors.title')}</AlertTitle>
          <AlertDescription>
            {mapApiError(detail.error, t).message}
          </AlertDescription>
        </Alert>
        <div>
          <Button
            variant="ghost"
            onClick={() => navigate('/consumer/my-complaints')}
          >
            {t('consumer.detail.back')}
          </Button>
        </div>
      </main>
    );
  }

  if (detail.isLoading || !view) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-3 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  }

  const status = view.status ?? 'SUBMITTED';
  const severity = view.severity ?? null;
  const canCancel = status === 'SUBMITTED';
  const canSubmitFeedback = status === 'CLOSED' && !feedbackSubmitted;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/consumer/my-complaints')}
        >
          ← {t('consumer.detail.back')}
        </Button>
        <h1 className="text-2xl font-semibold">
          {t('consumer.detail.ticket')}{' '}
          <span className="font-mono">{view.ticketNo ?? ticketNo}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">{t(`complaints.status.${status}`)}</Badge>
          {severity ? (
            <Badge tone={severity === 'HIGH' ? 'danger' : 'muted'}>
              {t(`complaints.severity.${severity}`)}
            </Badge>
          ) : null}
          {view.slaBreached ? (
            <Badge tone="danger">{t('consumer.detail.slaBreached')}</Badge>
          ) : null}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('consumer.detail.description')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="whitespace-pre-wrap text-sm">{view.description ?? '—'}</p>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Field label={t('consumer.detail.location')}>
              {view.location ?? '—'}
            </Field>
            <Field label={t('consumer.detail.contactMobile')}>
              {view.contactMobile ?? '—'}
            </Field>
            <Field label={t('consumer.detail.submittedAt')}>
              {view.submittedAt ? formatIstDateTime(view.submittedAt) : '—'}
            </Field>
            <Field label={t('consumer.detail.slaDeadline')}>
              {view.slaDeadline ? formatIstDateTime(view.slaDeadline) : '—'}
            </Field>
            {view.resolvedAt ? (
              <Field label={t('consumer.detail.resolvedAt')}>
                {formatIstDateTime(view.resolvedAt)}
              </Field>
            ) : null}
            {view.closedAt ? (
              <Field label={t('consumer.detail.closedAt')}>
                {formatIstDateTime(view.closedAt)}
              </Field>
            ) : null}
          </dl>

          {view.images && view.images.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                {t('consumer.detail.images')}
              </h3>
              <ul className="grid grid-cols-3 gap-2">
                {view.images.map((img) => (
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
          ) : null}
        </CardContent>
      </Card>

      {feedbackSubmitted ? (
        <FeedbackPanel feedback={feedbackRow} loading={feedback.isLoading} t={t} />
      ) : null}

      {canCancel || canSubmitFeedback ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('consumer.detail.actions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {canCancel ? (
                <Button
                  variant="danger"
                  onClick={() => setDialog('cancel')}
                >
                  {t('consumer.detail.cancel')}
                </Button>
              ) : null}
              {canSubmitFeedback ? (
                <Button onClick={() => setDialog('feedback')}>
                  {t('consumer.detail.feedback')}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('consumer.detail.historyHeading')}</CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <ConsumerHistoryTimeline entries={historyRows} />
          )}
        </CardContent>
      </Card>

      <CancelDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        ticketNo={ticketNo}
        onSuccess={() => {
          setDialog(null);
          toast(t('consumer.cancel.successToast'), 'success');
          invalidate();
        }}
        onStaleStatus={() => {
          setDialog(null);
          toast(t('consumer.cancel.staleToast'), 'warning');
          invalidate();
        }}
        onSessionLost={() => {
          setDialog(null);
          navigate('/consumer', { replace: true });
        }}
      />
      <FeedbackDialog
        open={dialog === 'feedback'}
        onClose={() => setDialog(null)}
        ticketNo={ticketNo}
        onSubmitted={(saved) => {
          setDialog(null);
          toast(t('consumer.feedback.successToast'), 'success');
          // BE Stage 20.2: POST returns the persisted row. Seed the
          // GET cache directly so the read-only panel renders without
          // a follow-up network call. Fall back to invalidate on the
          // 409 path (saved === null).
          if (saved) {
            queryClient.setQueryData(getGetFeedbackQueryKey(ticketNo), {
              data: { success: true, data: saved },
            } satisfies { data: Schemas.ApiResponseFeedbackResponse });
            invalidate();
          } else {
            invalidate({ feedback: true });
          }
        }}
      />
    </main>
  );
}

function FeedbackPanel({
  feedback,
  loading,
  t,
}: {
  feedback: Schemas.FeedbackResponse | null;
  loading: boolean;
  t: ReturnType<typeof useT>;
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('consumer.feedback.yourFeedback')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {loading || feedback === null ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <p className="text-sm">
              {t('consumer.feedback.rating')}:{' '}
              <span aria-label={`${feedback.rating ?? 0}`}>
                {'★'.repeat(feedback.rating ?? 0)}
                <span className="text-[var(--color-muted-200)]">
                  {'★'.repeat(Math.max(0, 5 - (feedback.rating ?? 0)))}
                </span>
              </span>
            </p>
            {feedback.comment ? (
              <p className="whitespace-pre-wrap text-sm">{feedback.comment}</p>
            ) : null}
            {feedback.submittedAt ? (
              <p className="text-xs text-[var(--color-muted-500)]">
                {formatIstDateTime(feedback.submittedAt)}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
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
    <main className="mx-auto flex max-w-xl flex-col gap-3 p-4">
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
    </main>
  );
}

