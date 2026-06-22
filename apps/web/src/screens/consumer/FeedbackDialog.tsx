/**
 * Feedback dialog — visible only when status === 'CLOSED' (BE Stage 19).
 *
 * Body: { rating: 1-5 (required), comment?: string (≤1000) }.
 *
 * BE Stage 19.x + 20.2:
 *  - Detail carries `feedbackSubmitted: boolean`, so the parent
 *    suppresses this dialog cleanly without the FE tracking it.
 *  - POST /feedback returns the persisted `FeedbackResponse` row;
 *    the dialog forwards it via `onSubmitted(saved)` so the parent
 *    can `setQueryData(getGetFeedbackQueryKey(ticketNo), saved)` and
 *    skip the follow-up GET.
 *  - 409 `FEEDBACK_ALREADY_SUBMITTED` still possible (stale tab),
 *    handled by swapping to the "thanks, already received" panel and
 *    nudging the parent to refetch.
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
  /**
   * Fired after a successful POST. `saved` is the persisted
   * `FeedbackResponse` from the BE — the parent should seed
   * `getGetFeedbackQueryKey(ticketNo)` with it.
   *
   * On a 409 (already submitted) `saved` is `null` and the parent
   * should refetch instead of seeding.
   */
  onSubmitted: (saved: Schemas.FeedbackResponse | null) => void;
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
      const res = await mutateAsync({ ticketNo, data });
      // BE Stage 20.2: POST returns the persisted FeedbackResponse so
      // the parent can seed the GET cache directly. Defensive optional
      // chaining keeps the dialog working in tests that mock with `{}`.
      const saved =
        (res as { data?: Schemas.ApiResponseFeedbackResponse } | undefined)
          ?.data?.data ?? null;
      onSubmitted(saved);
    } catch (err) {
      const mapped = mapApiError(err, t);
      if (mapped.code === 'FEEDBACK_ALREADY_SUBMITTED') {
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
            <Button
              type="button"
              onClick={() => {
                onClose();
                onSubmitted(null);
              }}
            >
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
