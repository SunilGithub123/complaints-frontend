/**
 * Hand-rolled multipart submit for `POST /api/v1/consumer/complaints`
 * on React Native. Mobile twin of
 * `apps/web/src/features/consumer/submitComplaint.ts` — same reasons
 * for bypassing orval's generated `submitComplaint`:
 *
 *   The generated helper does
 *
 *       formData.append('complaint', JSON.stringify(complaint));
 *
 *   which the RN FormData impl tags with `Content-Type: text/plain` (on
 *   web the browser does the same). The BE explicitly requires
 *   `application/json` on that part (see the `encoding.complaint.contentType`
 *   line in the OpenAPI spec — Stage 11 prompt warns about it).
 *
 * The RN workaround is different from web's Blob trick: RN's FormData
 * accepts `{uri, name, type}` object parts (backed by files on disk),
 * so we write the complaint JSON to a temp file in the cache dir and
 * append it with `type: 'application/json'`. Images are the RN-native
 * `{uri, name, type}` shape produced by `prepareImageForUpload`.
 *
 * Part names are exact and match the BE contract:
 *   - `complaint` (one application/json part)
 *   - `images`    (0..3 image/jpeg or image/png parts)
 * Anything else — `image`, `complaintData`, etc. — 400s with
 * "Required part not present".
 */
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system';
import { customFetch, type Schemas } from '@complaints/api';

import type { PreparedImage } from './imageCompression';

export interface SubmitComplaintArgs {
  complaint: Schemas.SubmitComplaintRequest;
  /** Already-compressed image parts. 0..3, ≤ 1 MB each, image/jpeg or image/png. */
  images: readonly PreparedImage[];
}

export interface SubmitComplaintFetchResult {
  status: number;
  data: Schemas.ApiResponseSubmitComplaintResponse;
  headers: Headers;
}

/**
 * RN's FormData typings don't include the `{uri, name, type}` object
 * form, though the runtime accepts it. Cast at the boundary so the
 * rest of the file stays typed.
 */
type RnFilePart = { uri: string; name: string; type: string };
function appendFile(form: FormData, field: string, part: RnFilePart): void {
  (form as unknown as {
    append: (name: string, value: RnFilePart, fileName?: string) => void;
  }).append(field, part, part.name);
}

export async function submitComplaintMultipart(
  args: SubmitComplaintArgs,
): Promise<SubmitComplaintFetchResult> {
  // Temp file for the JSON part. Cache dir is fine — the OS reclaims it
  // under memory pressure and we delete it on success/failure anyway.
  // Unique per-call filename so two rapid submits can't stomp on each other.
  const tmpUri = `${FileSystem.cacheDirectory ?? ''}complaint-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(tmpUri, JSON.stringify(args.complaint), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  try {
    const form = new FormData();
    appendFile(form, 'complaint', {
      uri: tmpUri,
      name: 'complaint.json',
      type: 'application/json',
    });
    for (const img of args.images) {
      appendFile(form, 'images', { uri: img.uri, name: img.name, type: img.type });
    }
    return await customFetch<SubmitComplaintFetchResult>(
      '/api/v1/consumer/complaints',
      {
        method: 'POST',
        body: form,
        // Do NOT set Content-Type — RN's fetch sets the multipart boundary
        // header itself; overriding here strips the boundary and the BE
        // rejects the body as malformed. Same rule as web.
      },
    );
  } finally {
    // Best-effort cleanup; a leaked cache file is not a correctness issue.
    FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {
      /* swallow — the OS will reclaim it */
    });
  }
}

export function useSubmitComplaint(): UseMutationResult<
  SubmitComplaintFetchResult,
  unknown,
  SubmitComplaintArgs
> {
  return useMutation({
    mutationKey: ['consumer', 'submitComplaint'],
    mutationFn: submitComplaintMultipart,
  });
}

