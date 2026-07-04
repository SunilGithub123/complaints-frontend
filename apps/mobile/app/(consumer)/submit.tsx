/**
 * `/(consumer)/submit` — real complaint form (Stage 21.3-b.3-b-2).
 *
 * Twin of `apps/web/src/screens/consumer/SubmitScreen.tsx`, adapted for
 * React Native:
 *
 *   - Category dropdown → a rolled-own Modal picker (list of Pressable
 *     rows) rather than `@react-native-picker/picker`. YAGNI on a Picker
 *     dependency until a second screen needs one; a Modal-based row list
 *     is ~30 LOC and testable via `userEvent.press()`.
 *   - Description → multi-line `TextInput`.
 *   - Location → single-line `TextInput`, optional.
 *   - Images → 0..3 photos via `expo-image-picker`, compressed to
 *     ≤ 1 MB each by `prepareImageForUpload` before submit.
 *
 * Guarded — `!isVerified` bounces back to landing (the token TTL is the
 * real gate; the store selector goes false the instant the 5-minute
 * window elapses).
 *
 * Draft persistence (as of 21.3-b.3-b-3): the typed
 * `{categoryId, description, location}` mirror to `AsyncStorage` on
 * every change, hydrate back on mount, and clear on successful submit.
 * Images are deliberately NOT persisted — see `draftStorage.ts` for why.
 * On mount, if a non-empty draft is restored, a small banner surfaces
 * so the user isn't confused by pre-filled fields ("photos need to be
 * re-picked" mirrors web).
 *
 * On success we `router.replace` to `/(consumer)/submitted` with the
 * ticket number as a query param — expo-router's file-based analogue
 * of web's `/consumer/submitted/:ticketNo`.
 */
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as ImagePicker from 'expo-image-picker';
import {
  useListActiveCategoriesForConsumer,
  ApiError,
  type Schemas,
} from '@complaints/api';
import { useT } from '@complaints/i18n';

import {
  useConsumerAuthStore,
  selectIsVerified,
  selectMinutesRemaining,
} from '@/auth/consumerAuthStore';
import { useSubmitComplaint } from '@/lib/submitComplaint';
import {
  loadDraft,
  saveDraft,
  clearDraft,
  draftIsNonEmpty,
} from '@/lib/draftStorage';
import {
  prepareImageForUpload,
  assertImageCount,
  ImagePickError,
  MAX_IMAGES_PER_COMPLAINT,
  type PreparedImage,
} from '@/lib/imageCompression';
import { mapApiError } from '@/lib/apiErrors';
import { usePushRegistration } from '@/lib/usePushRegistration';

const PAGE: Schemas.Pageable = { page: 0, size: 100, sort: ['name,asc'] };

const submitSchema = z.object({
  categoryId: z.number().int().positive(),
  description: z.string().min(1).max(4000),
  location: z.string().max(500),
});
type SubmitValues = z.infer<typeof submitSchema>;

export default function ConsumerSubmitScreen(): React.JSX.Element {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isVerified = useConsumerAuthStore(selectIsVerified);
  const minutesLeft = useConsumerAuthStore(selectMinutesRemaining);
  const consumerId = useConsumerAuthStore((s) => s.consumerId);
  const mobile = useConsumerAuthStore((s) => s.mobile);
  const clearConsumer = useConsumerAuthStore((s) => s.clear);

  if (!isVerified || !consumerId || !mobile) {
    return <Redirect href="/(consumer)/landing" />;
  }

  return (
    <SubmitForm
      t={t}
      insets={insets}
      router={router}
      consumerId={consumerId}
      mobile={mobile}
      minutesLeft={minutesLeft}
      onStartOver={() => {
        void clearDraft();
        clearConsumer();
        router.replace('/(consumer)/landing');
      }}
    />
  );
}

interface SubmitFormProps {
  t: ReturnType<typeof useT>;
  insets: { top: number };
  router: ReturnType<typeof useRouter>;
  consumerId: string;
  mobile: string;
  minutesLeft: number;
  onStartOver: () => void;
}

function SubmitForm({
  t,
  insets,
  router,
  consumerId,
  mobile,
  minutesLeft,
  onStartOver,
}: SubmitFormProps): React.JSX.Element {
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const categoriesQuery = useListActiveCategoriesForConsumer({ pageable: PAGE });
  const categoriesEnvelope = (
    categoriesQuery.data as
      | { data: Schemas.ApiResponsePageResponseComplaintCategoryResponse }
      | undefined
  )?.data;
  const categories = categoriesEnvelope?.data?.content ?? [];

  const submitMutation = useSubmitComplaint();
  const { runIfNeeded: runPushRegistration } = usePushRegistration('consumer');

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<SubmitValues>({
    resolver: zodResolver(submitSchema),
    defaultValues: { categoryId: 0, description: '', location: '' },
  });

  // Hydrate the draft on mount (AsyncStorage is async; we can't feed
  // this into `defaultValues` synchronously). Cancel via a mounted
  // flag so an unmount-mid-load doesn't call `reset` on a dead form.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const draft = await loadDraft();
      if (!mounted) return;
      if (draftIsNonEmpty(draft)) {
        reset({
          categoryId: draft.categoryId ?? 0,
          description: draft.description,
          location: draft.location,
        });
        setDraftRestored(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [reset]);

  // Auto-save: mirror every change to AsyncStorage. `watch` returns a
  // Subscription; unsubscribe on unmount so a re-render after unmount
  // doesn't touch storage.
  useEffect(() => {
    const sub = watch((values) => {
      void saveDraft({
        categoryId:
          typeof values.categoryId === 'number' && values.categoryId > 0
            ? values.categoryId
            : null,
        description: values.description ?? '',
        location: values.location ?? '',
      });
    });
    return () => sub.unsubscribe();
  }, [watch]);

  const currentCategoryId = watch('categoryId');
  const currentCategory = categories.find((c) => c.id === currentCategoryId);

  const onAddPhoto = async (): Promise<void> => {
    setImageError(null);
    try {
      assertImageCount(1, images.length);
    } catch (err) {
      if (err instanceof ImagePickError) {
        setImageError(t(`consumer.submit.${toImagesKey(err.code)}`));
        return;
      }
      setImageError(t('errors.generic'));
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      // Permission-denied copy shares the `imagePermissionDenied` key —
      // added to the catalogue alongside this slice.
      setImageError(t('consumer.submit.imagePermissionDenied'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
      selectionLimit: 1,
    });
    if (result.canceled) return;

    setImageBusy(true);
    try {
      const asset = result.assets[0];
      if (!asset) return;
      const prepared = await prepareImageForUpload(asset);
      setImages((prev) => [...prev, prepared]);
    } catch (err) {
      if (err instanceof ImagePickError) {
        setImageError(t(`consumer.submit.${toImagesKey(err.code)}`));
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
    setFormError(null);
    try {
      const response = await submitMutation.mutateAsync({
        complaint: {
          consumerId,
          mobile,
          categoryId: values.categoryId,
          description: values.description,
          location: values.location || undefined,
        },
        images,
      });
      const payload = response.data.data;
      if (!payload?.ticketNo) {
        setFormError(t('errors.generic'));
        return;
      }
      // Draft only matters for the in-progress complaint — once we
      // have a ticket number, clear it so a re-visit to the form
      // starts fresh.
      void clearDraft();
      // §9.6 consumer trigger: request push permission + register the
      // device on the FIRST successful submit. Fire-and-forget — push
      // failures MUST NOT block the confirmation-screen redirect
      // (worst case: no push for this consumer this session; a future
      // submit re-triggers per the same short-circuit logic).
      void runPushRegistration();
      router.replace({
        // Cast: expo-router's route-typegen runs on `expo start` /
        // `expo build`; it hasn't observed `submitted.tsx` yet in the
        // static-only typecheck path. The route exists; the typegen
        // catches up on the next `expo` invocation.
        pathname: '/(consumer)/submitted' as never,
        params: {
          ticketNo: payload.ticketNo,
          submittedAt: payload.submittedAt ?? '',
          slaDeadline: payload.slaDeadline ?? '',
        },
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('consumer.submit.title')}</Text>
        <Text style={styles.meta}>
          {t('consumer.submit.tokenExpiresIn', { minutes: minutesLeft })}
        </Text>

        {draftRestored ? (
          <View accessibilityRole="alert" style={styles.info}>
            <Text style={styles.infoText}>
              {t('consumer.submit.restoredDraft')}
            </Text>
          </View>
        ) : null}

        {/* Category */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('consumer.submit.category')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('consumer.submit.category')}
            onPress={() => setPickerOpen(true)}
            disabled={categoriesQuery.isPending}
            style={[
              styles.input,
              styles.selectRow,
              errors.categoryId ? styles.inputError : null,
            ]}
          >
            <Text
              style={
                currentCategory ? styles.selectValue : styles.selectPlaceholder
              }
            >
              {currentCategory
                ? currentCategory.name
                : t('consumer.submit.categoryPlaceholder')}
            </Text>
            <Text style={styles.selectChevron}>▾</Text>
          </Pressable>
          {errors.categoryId ? (
            <Text style={styles.errorText}>
              {t('consumer.submit.categoryRequired')}
            </Text>
          ) : null}
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('consumer.submit.description')}</Text>
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                accessibilityLabel={t('consumer.submit.description')}
                multiline
                numberOfLines={5}
                placeholder=""
                style={[
                  styles.input,
                  styles.textarea,
                  errors.description ? styles.inputError : null,
                ]}
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />
          <Text style={styles.help}>{t('consumer.submit.descriptionHelp')}</Text>
          {errors.description ? (
            <Text style={styles.errorText}>
              {t('consumer.submit.descriptionRequired')}
            </Text>
          ) : null}
        </View>

        {/* Location */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('consumer.submit.location')}</Text>
          <Controller
            control={control}
            name="location"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                accessibilityLabel={t('consumer.submit.location')}
                placeholder={t('consumer.submit.locationPlaceholder')}
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />
        </View>

        {/* Photos */}
        <View style={styles.field}>
          <Text style={styles.label}>{t('consumer.submit.images')}</Text>
          <Text style={styles.help}>{t('consumer.submit.imagesHelp')}</Text>
          <View style={styles.imagesRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('consumer.submit.imagesPick')}
              accessibilityState={{
                busy: imageBusy,
                disabled: imageBusy || images.length >= MAX_IMAGES_PER_COMPLAINT,
              }}
              disabled={imageBusy || images.length >= MAX_IMAGES_PER_COMPLAINT}
              onPress={() => {
                void onAddPhoto();
              }}
              style={({ pressed }) => [
                styles.secondaryButton,
                (pressed || imageBusy) && styles.secondaryButtonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {imageBusy
                  ? t('consumer.submit.imagesCompressing')
                  : t('consumer.submit.imagesPick')}
              </Text>
            </Pressable>
            <Text style={styles.imagesCount}>
              {images.length} / {MAX_IMAGES_PER_COMPLAINT}
            </Text>
          </View>
          {imageError ? (
            <View accessibilityRole="alert" style={styles.alert}>
              <Text style={styles.alertText}>{imageError}</Text>
            </View>
          ) : null}
          {images.length > 0 ? (
            <View style={styles.imageList}>
              {images.map((img, i) => (
                <View key={`${img.name}-${i}`} style={styles.imageRow}>
                  <Text style={styles.imageName} numberOfLines={1}>
                    {img.name}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('consumer.submit.imagesRemove')}
                    onPress={() => removeImage(i)}
                  >
                    <Text style={styles.imageRemove}>
                      {t('consumer.submit.imagesRemove')}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {formError ? (
          <View accessibilityRole="alert" style={styles.alert}>
            <Text style={styles.alertText}>{formError}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('consumer.submit.submit')}
          accessibilityState={{
            busy: submitMutation.isPending,
            disabled: submitMutation.isPending || imageBusy,
          }}
          disabled={submitMutation.isPending || imageBusy}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.button,
            (pressed || submitMutation.isPending) && styles.buttonPressed,
          ]}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>{t('consumer.submit.submit')}</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={onStartOver}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>{t('consumer.otp.startOver')}</Text>
        </Pressable>
      </ScrollView>

      {/* Category picker modal. Kept in-file — a shared Bottom Sheet
          primitive earns its keep at the third caller (per the
          "abstract the second time" rule); this is the first. */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {t('consumer.submit.category')}
            </Text>
            {categories.length === 0 ? (
              <Text style={styles.modalEmpty}>—</Text>
            ) : (
              categories.map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setValue('categoryId', c.id ?? 0, {
                      shouldValidate: true,
                    });
                    setPickerOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.modalRow,
                    pressed && styles.modalRowPressed,
                  ]}
                >
                  <Text style={styles.modalRowText}>{c.name}</Text>
                </Pressable>
              ))
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// i18n keys use camelCase; ImagePickError codes are SCREAMING_SNAKE.
// Map at the boundary rather than renaming the enum. Kept private
// because it only makes sense here.
function toImagesKey(code: string): string {
  switch (code) {
    case 'IMAGE_INVALID_TYPE':
      return 'imageInvalidType';
    case 'IMAGE_TOO_LARGE':
      return 'imageTooLarge';
    case 'IMAGE_LIMIT_EXCEEDED':
      return 'imageLimitExceeded';
    case 'IMAGE_COMPRESSION_FAILED':
      return 'imageCompressionFailed';
    default:
      return 'imageTooLarge';
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#ffffff' },
  container: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 14,
    backgroundColor: '#ffffff',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 13, color: '#64748b', marginBottom: 4 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155' },
  help: { fontSize: 12, color: '#64748b' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  inputError: { borderColor: '#dc2626' },
  errorText: { fontSize: 12, color: '#dc2626' },
  selectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectValue: { color: '#0f172a', fontSize: 15 },
  selectPlaceholder: { color: '#94a3b8', fontSize: 15 },
  selectChevron: { color: '#64748b', fontSize: 14 },
  imagesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  imagesCount: { color: '#64748b', fontSize: 13 },
  imageList: { gap: 6, marginTop: 6 },
  imageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  imageName: { flex: 1, color: '#0f172a', fontSize: 13 },
  imageRemove: { color: '#64748b', textDecorationLine: 'underline', fontSize: 12 },
  alert: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  alertText: { color: '#991b1b', fontSize: 13 },
  info: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  infoText: { color: '#1e3a8a', fontSize: 13 },
  button: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
  secondaryButton: {
    borderColor: '#0f172a',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  secondaryButtonPressed: { opacity: 0.7 },
  secondaryButtonText: { color: '#0f172a', fontWeight: '600', fontSize: 14 },
  linkButton: { alignItems: 'center', marginTop: 8 },
  linkText: { color: '#64748b', textDecorationLine: 'underline', fontSize: 13 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  modalEmpty: { color: '#64748b', fontSize: 13, paddingVertical: 6 },
  modalRow: { paddingVertical: 10, paddingHorizontal: 4 },
  modalRowPressed: { backgroundColor: '#f1f5f9' },
  modalRowText: { color: '#0f172a', fontSize: 15 },
});

