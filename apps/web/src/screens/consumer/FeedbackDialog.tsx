/* eslint-disable react-refresh/only-export-components -- co-located storage helpers (rememberSubmitted / wasSubmittedThisSession) are exported alongside the dialog component; splitting them into a separate file would be over-engineering for two one-liner getters. */
/**
 * Feedback dialog — visible only when status === 'CLOSED' (BE Stage 19).
 *
 * Body: { rating: 1-5 (required), comment?: string (≤1000) }.
 *
 * BE deferred:
 *  - "Has the consumer already submitted feedback?" is not on the
 *    detail response (TODO BE follow-up — see IMPLEMENTATION_LOG
 *    carry-overs). Today we discover it via the 409
 *    FEEDBACK_ALREADY_SUBMITTED response and remember locally for the
 *    rest of the session.
 *  - GET /feedback also deferred — we can't render the persisted
 *    comment on a returning visit. The dialog shows a generic "thanks,
 *    feedback already received" state in that case.
 *
 * Local cache key: `complaints:feedback-submitted:<ticketNo>` in
 * sessionStorage. Cleared when the consumer "starts over".
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSubmitFeedback, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mapApiError } from '@/lib/apiErrors';

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
type Values = z.infer<typeof schema>;

export interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  ticketNo: string;
  /** Called after a successful submit OR a 409 (idempotent at BE level). */
  onSubmitted: () => void;
}

export function FeedbackDialog({
  open,
  onClose,
  ticketNo,
  onSubmitted,
}: FeedbackDialogProps): React.JSX.Element {
  const t = useT();
  const { mutateAsync, isPending } = useSubmitFeedback();
  const [formError, setFormError] = useState<string | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { rating: 0 as unknown as number, comment: '' },
  });

  useEffect(() => {
    if (open) {
      setFormError(null);
      setAlreadySubmitted(false);
      form.reset({ rating: 0 as unknown as number, comment: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rating = form.watch('rating');

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const data: Schemas.SubmitFeedbackRequest = {
      rating: values.rating,
      ...(values.comment ? { comment: values.comment } : {}),
    };
    try {
      await mutateAsync({ ticketNo, data });
      rememberSubmitted(ticketNo);
      onSubmitted();
    } catch (err) {
      const mapped = mapApiError(err, t);
      if (mapped.code === 'FEEDBACK_ALREADY_SUBMITTED') {
        rememberSubmitted(ticketNo);
        setAlreadySubmitted(true);
        return;
      }
      setFormError(mapped.message);
    }
  });

  if (alreadySubmitted) {
    return (
      <Dialog open={open} onClose={onClose} title={t('consumer.feedback.title')}>
        <div className="flex flex-col gap-4">
          <p className="text-sm">{t('consumer.feedback.alreadySubmitted')}</p>
          <div className="flex justify-end">
            <Button type="button" onClick={() => { onClose(); onSubmitted(); }}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('consumer.feedback.title')}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <p className="text-sm text-[var(--color-muted-500)]">
          {t('consumer.feedback.body')}
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="feedback-rating">{t('consumer.feedback.rating')}</Label>
          <StarPicker
            value={rating}
            onChange={(v) =>
              form.setValue('rating', v, { shouldValidate: true })
            }
            label={t('consumer.feedback.rating')}
          />
          {form.formState.errors.rating ? (
            <p className="text-xs text-[var(--color-danger-600)]">
              {t('consumer.feedback.ratingRequired')}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="feedback-comment">{t('consumer.feedback.comment')}</Label>
          <textarea
            id="feedback-comment"
            rows={4}
            maxLength={1000}
            placeholder={t('consumer.feedback.commentPlaceholder')}
            className="flex w-full rounded-md border border-[var(--color-muted-200)] bg-white px-3 py-2 text-sm"
            {...form.register('comment')}
          />
        </div>

        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? t('consumer.feedback.submitting')
              : t('consumer.feedback.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const STARS = [1, 2, 3, 4, 5] as const;

function StarPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      id="feedback-rating"
      className="flex gap-1"
    >
      {STARS.map((n) => {
        const selected = n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}`}
            onClick={() => onChange(n)}
            className={
              'h-9 w-9 rounded-md text-xl ' +
              (selected
                ? 'text-[var(--color-brand-600)]'
                : 'text-[var(--color-muted-200)]')
            }
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

const STORAGE_PREFIX = 'complaints:feedback-submitted:';

export function rememberSubmitted(ticketNo: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${ticketNo}`, '1');
  } catch {
    /* sessionStorage may throw in private mode; the in-memory state in
     * the parent screen is enough for the rest of the session. */
  }
}

export function wasSubmittedThisSession(ticketNo: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(`${STORAGE_PREFIX}${ticketNo}`) === '1';
  } catch {
    return false;
  }
}
