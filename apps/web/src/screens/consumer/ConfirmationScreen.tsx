/**
 * `/consumer/submitted/:ticketNo` — confirmation screen.
 *
 * Two render paths:
 *   1. Just submitted — the SubmitScreen handed us the response via
 *      `location.state.response` (SubmitComplaintResponse). We render
 *      from that immediately, no network round trip.
 *   2. Page refresh — `location.state` is gone. We call
 *      `useGetComplaintByTicket(ticketNo)` and render once it resolves.
 *      A 403 means the JWT we have is for a *different* consumer
 *      (BE's "owned-by-consumer" check) → surface the friendly
 *      "this ticket isn't yours" state.
 *
 * Refresh button: explicit re-fetch via the same query. Useful while
 * Phase 5 lifecycle is shipping — once SUBMITTED → ASSIGNED transitions
 * exist, the consumer can pull-to-refresh on the same screen.
 */
import { useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  useGetComplaintByTicket,
  ApiError,
  type Schemas,
} from '@complaints/api';
import { formatIstDateTime } from '@complaints/utils';
import { useT } from '@complaints/i18n';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConsumerAuthStore } from '@/features/consumer/consumerAuthStore';

interface ConfirmationState {
  response?: Schemas.SubmitComplaintResponse;
}

export default function ConfirmationScreen(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { ticketNo } = useParams<{ ticketNo: string }>();
  const location = useLocation();
  const handedDown = (location.state as ConfirmationState | null)?.response;
  const { show } = useToast();

  // Skip the network call entirely on the happy "just submitted" path.
  const query = useGetComplaintByTicket<
    { data?: Schemas.ApiResponseComplaintDetailResponse },
    unknown
  >(ticketNo ?? '', {
    query: {
      enabled: !handedDown && !!ticketNo,
      retry: false,
      refetchOnWindowFocus: false,
    },
  });

  const fetched = query.data?.data?.data;
  const view: ViewModel | null = useMemo(() => {
    if (handedDown) {
      return {
        ticketNo: handedDown.ticketNo ?? ticketNo ?? '',
        submittedAt: handedDown.submittedAt ?? null,
        slaDeadline: handedDown.slaDeadline ?? null,
        images: handedDown.images ?? [],
      };
    }
    if (fetched) {
      return {
        ticketNo: fetched.ticketNo ?? ticketNo ?? '',
        submittedAt: fetched.submittedAt ?? null,
        slaDeadline: fetched.slaDeadline ?? null,
        images: fetched.images ?? [],
      };
    }
    return null;
  }, [handedDown, fetched, ticketNo]);

  // 403 from the BE = "not yours" (per Stage 10b contract). 404s are
  // re-mapped server-side to 403 too, so we treat any error code with
  // status === 403 as the not-yours state. Anything else is a generic
  // failure.
  const notYours =
    query.isError &&
    query.error instanceof ApiError &&
    query.error.status === 403;

  const onCopy = async (): Promise<void> => {
    if (!view?.ticketNo) return;
    try {
      await navigator.clipboard.writeText(view.ticketNo);
      show(t('consumer.confirmation.copied'), 'success');
    } catch {
      show(t('errors.generic'), 'warning');
    }
  };

  const onShare = async (): Promise<void> => {
    if (!view?.ticketNo) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: t('consumer.confirmation.title'),
          text: `${t('consumer.confirmation.ticketLabel')}: ${view.ticketNo}`,
        });
      } catch {
        // user-cancelled share is normal; swallow.
      }
    } else {
      void onCopy();
    }
  };

  const onStartOver = (): void => {
    useConsumerAuthStore.getState().clear();
    navigate('/consumer', { replace: true });
  };

  if (notYours) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('consumer.confirmation.notYoursTitle')}</CardTitle>
            <CardDescription>
              {t('consumer.confirmation.notYoursBody')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onStartOver}>{t('consumer.confirmation.startOver')}</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!view) {
    if (query.isError) {
      return (
        <main className="mx-auto flex max-w-xl flex-col gap-4 p-4">
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t('errors.generic')}</AlertDescription>
          </Alert>
        </main>
      );
    }
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-4 p-4">
        <Skeleton className="h-48 w-full" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('consumer.confirmation.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-[var(--color-muted-500)]">
              {t('consumer.confirmation.ticketLabel')}
            </span>
            <span className="font-mono text-lg">{view.ticketNo}</span>
          </div>

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--color-muted-500)]">
                {t('consumer.confirmation.submittedAt')}
              </dt>
              <dd>{view.submittedAt ? formatIstDateTime(view.submittedAt) : '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted-500)]">
                {t('consumer.confirmation.slaDeadline')}
              </dt>
              <dd>{view.slaDeadline ? formatIstDateTime(view.slaDeadline) : '—'}</dd>
            </div>
          </dl>

          {view.images.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                {t('consumer.confirmation.imagesHeading')}
              </h3>
              <ul className="grid grid-cols-3 gap-2">
                {view.images.map((img) => (
                  <li
                    key={img.id ?? img.url}
                    className="overflow-hidden rounded-md border border-[var(--color-muted-200)]"
                  >
                    {img.url ? (
                      // Width hint helps the browser allocate space; signed
                      // URLs from BE are valid for ~ 1 hour (Stage 10c).
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

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={onCopy}>
              {t('consumer.confirmation.copy')}
            </Button>
            <Button type="button" variant="secondary" onClick={onShare}>
              {t('consumer.confirmation.share')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              {query.isFetching
                ? t('consumer.confirmation.refreshing')
                : t('consumer.confirmation.refresh')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/consumer/my-complaints')}
            >
              {t('consumer.confirmation.viewAll')}
            </Button>
            <Button type="button" variant="ghost" onClick={onStartOver}>
              {t('consumer.confirmation.startOver')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

interface ViewModel {
  ticketNo: string;
  submittedAt: string | null;
  slaDeadline: string | null;
  images: readonly Schemas.ComplaintImageResponse[];
}





