/**
 * `/consumer/submit` — complaint form.
 *
 * Gated by `ConsumerRequireVerification` (router-level), so we know
 * `consumerId` + `mobile` are present in the consumer store on mount.
 * Three sections:
 *  1. Category dropdown — `useListActiveCategoriesForConsumer` (consumer-scoped
 *     endpoint, returns only active categories).
 *  2. Description + optional location.
 *  3. Image picker — 0..3 JPEG/PNG, client-side compressed to ≤ 1 MB
 *     each before they ever cross the network.
 *
 * Draft persistence: every keystroke writes to sessionStorage under
 * `complaintDraft:v1`. If the user's verification token expires mid-form
 * the guard sends them back to /consumer; on a successful re-OTP we
 * return here and the draft auto-restores from sessionStorage. Images
 * can't survive that round trip (File objects don't JSON-serialize) so
 * we surface a banner asking the user to re-pick.
 */
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import {
  useListActiveCategoriesForConsumer,
  ApiError,
  type Schemas,
} from '@complaints/api';
import { useT } from '@complaints/i18n';
import { useConsumerAuthStore } from '@/features/consumer/consumerAuthStore';
import {
  useSubmitComplaint,
  type SubmitComplaintFetchResult,
} from '@/features/consumer/submitComplaint';
import {
  prepareImageForUpload,
  assertImageCount,
  ImagePickError,
  MAX_IMAGES_PER_COMPLAINT,
  ALLOWED_MIME_TYPES,
} from '@/features/consumer/imageCompression';
import {
  loadDraft,
  saveDraft,
  clearDraft,
  EMPTY_DRAFT,
  type ComplaintDraft,
} from '@/features/consumer/draftStorage';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mapApiError } from '@/lib/apiErrors';

const PAGE: Schemas.Pageable = { page: 0, size: 100, sort: ['name,asc'] };

const submitSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  description: z.string().min(1).max(4000),
  location: z.string().max(500),
});
type SubmitValues = z.infer<typeof submitSchema>;

export default function SubmitScreen(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();

  const consumerId = useConsumerAuthStore((s) => s.consumerId);
  const mobile = useConsumerAuthStore((s) => s.mobile);

  // Hydrate from sessionStorage once. `restored` lets the screen render
  // the "we restored your draft" banner only when it actually did so.
  const restoredRef = useRef<ComplaintDraft>(loadDraft());
  const [draftWasRestored] = useState(
    () =>
      restoredRef.current.description !== EMPTY_DRAFT.description ||
      restoredRef.current.categoryId !== EMPTY_DRAFT.categoryId ||
      restoredRef.current.location !== EMPTY_DRAFT.location,
  );

  const [images, setImages] = useState<File[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const categoriesQuery = useListActiveCategoriesForConsumer({ pageable: PAGE });
  const categoriesEnvelope = (
    categoriesQuery.data as
      | { data: Schemas.ApiResponsePageResponseComplaintCategoryResponse }
      | undefined
  )?.data;
  const categories = categoriesEnvelope?.data?.content ?? [];

  const submitMutation = useSubmitComplaint();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SubmitValues>({
    resolver: zodResolver(submitSchema),
    defaultValues: {
      categoryId: restoredRef.current.categoryId ?? 0,
      description: restoredRef.current.description,
      location: restoredRef.current.location,
    },
  });

  // Auto-save: subscribe to every change and mirror to sessionStorage.
  useEffect(() => {
    const sub = watch((values) => {
      saveDraft({
        categoryId:
          values.categoryId && Number(values.categoryId) > 0
            ? Number(values.categoryId)
            : null,
        description: values.description ?? '',
        location: values.location ?? '',
      });
    });
    return () => sub.unsubscribe();
  }, [watch]);

  const onPickFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    setImageError(null);
    setImageBusy(true);
    try {
      assertImageCount(files.length, images.length);
      const prepared: File[] = [];
      for (let i = 0; i < files.length; i++) {
        // Files-by-index because FileList isn't iterable in older TS lib.
        const f = files.item(i);
        if (!f) continue;
        prepared.push(await prepareImageForUpload(f));
      }
      setImages((prev) => [...prev, ...prepared]);
    } catch (err) {
      if (err instanceof ImagePickError) {
        setImageError(t(`errors.${err.code}`));
      } else {
        setImageError(t('errors.generic'));
      }
    } finally {
      setImageBusy(false);
    }
  };

  const removeImage = (index: number): void => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = handleSubmit(async (values) => {
    if (!consumerId || !mobile) {
      // Belt-and-braces: the route guard should have prevented this.
      navigate('/consumer', { replace: true });
      return;
    }
    setFormError(null);
    try {
      const response: SubmitComplaintFetchResult = await submitMutation.mutateAsync(
        {
          complaint: {
            consumerId,
            mobile,
            categoryId: values.categoryId,
            description: values.description,
            location: values.location || undefined,
          },
          images,
        },
      );
      const payload = response.data.data;
      if (!payload?.ticketNo) {
        setFormError(t('errors.generic'));
        return;
      }
      clearDraft();
      // Pass the full response in route state so the confirmation screen
      // doesn't need an immediate follow-up GET. A page refresh on the
      // confirmation will fall back to `getByTicket`.
      navigate(`/consumer/submitted/${encodeURIComponent(payload.ticketNo)}`, {
        replace: true,
        state: { response: payload },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(mapApiError(err, t).message);
      } else {
        setFormError(t('errors.network'));
      }
    }
  });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('consumer.submit.title')}</CardTitle>
          <CardDescription>
            {/* Subtitle deliberately left blank to keep the form tight on mobile. */}
            &nbsp;
          </CardDescription>
        </CardHeader>
        <CardContent>
          {draftWasRestored ? (
            <Alert className="mb-4">
              <AlertDescription>
                {t('consumer.submit.restoredDraft')}
              </AlertDescription>
            </Alert>
          ) : null}

          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="categoryId">{t('consumer.submit.category')}</Label>
              <Select
                id="categoryId"
                aria-invalid={errors.categoryId ? true : undefined}
                aria-describedby={errors.categoryId ? 'categoryId-error' : undefined}
                disabled={categoriesQuery.isPending}
                {...register('categoryId')}
              >
                <option value="">{t('consumer.submit.categoryPlaceholder')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {errors.categoryId ? (
                <p id="categoryId-error" className="text-xs text-[var(--color-danger-600)]">
                  {t('consumer.submit.categoryRequired')}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">{t('consumer.submit.description')}</Label>
              <textarea
                id="description"
                rows={5}
                aria-invalid={errors.description ? true : undefined}
                aria-describedby={
                  errors.description ? 'description-error' : 'description-help'
                }
                className="rounded-md border border-[var(--color-muted-200)] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
                {...register('description')}
              />
              <p id="description-help" className="text-xs text-[var(--color-muted-500)]">
                {t('consumer.submit.descriptionHelp')}
              </p>
              {errors.description ? (
                <p id="description-error" className="text-xs text-[var(--color-danger-600)]">
                  {errors.description.message === 'String must contain at most 4000 character(s)'
                    ? t('consumer.submit.descriptionTooLong')
                    : t('consumer.submit.descriptionRequired')}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location">{t('consumer.submit.location')}</Label>
              <Input
                id="location"
                placeholder={t('consumer.submit.locationPlaceholder')}
                {...register('location')}
              />
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">
                {t('consumer.submit.images')}
              </legend>
              <p className="text-xs text-[var(--color-muted-500)]">
                {t('consumer.submit.imagesHelp')}
              </p>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="image-picker"
                  className="cursor-pointer rounded-md border border-[var(--color-muted-200)] bg-white px-3 py-2 text-sm hover:bg-[var(--color-muted-100)]"
                >
                  {imageBusy
                    ? t('consumer.submit.imagesCompressing')
                    : t('consumer.submit.imagesPick')}
                </Label>
                <input
                  id="image-picker"
                  type="file"
                  accept={ALLOWED_MIME_TYPES.join(',')}
                  multiple
                  className="sr-only"
                  disabled={
                    imageBusy || images.length >= MAX_IMAGES_PER_COMPLAINT
                  }
                  onChange={(e) => {
                    void onPickFiles(e.target.files);
                    e.target.value = ''; // allow re-selecting the same file
                  }}
                />
                <span className="text-xs text-[var(--color-muted-500)]">
                  {images.length} / {MAX_IMAGES_PER_COMPLAINT}
                </span>
              </div>
              {imageError ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{imageError}</AlertDescription>
                </Alert>
              ) : null}
              {images.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {images.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center justify-between rounded-md border border-[var(--color-muted-200)] bg-white px-3 py-2 text-sm"
                    >
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="text-xs text-[var(--color-muted-500)] underline hover:text-[var(--color-danger-600)]"
                      >
                        {t('consumer.submit.imagesRemove')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </fieldset>

            {formError ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={submitMutation.isPending || imageBusy}>
              {submitMutation.isPending
                ? t('consumer.submit.submitting')
                : t('consumer.submit.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

