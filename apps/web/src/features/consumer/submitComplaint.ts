/**
 * Hand-rolled multipart submit for `POST /api/v1/consumer/complaints`.
 *
 * Why not the generated `submit()` from `@complaints/api`:
 *   orval's multipart helper does
 *
 *       formData.append('complaint', JSON.stringify(complaint));
 *
 *   which makes the browser tag the part with `Content-Type: text/plain`.
 *   The BE explicitly requires `application/json` on that part (see the
 *   `encoding.complaint.contentType` line in the OpenAPI spec — Stage 11
 *   prompt warns about it). The fix is one line: wrap the JSON in a Blob
 *   with the right MIME. Same `customFetch` transport, same TanStack
 *   Query story — just a different body builder.
 *
 * Part names are exact:
 *   - `complaint` (one JSON part)
 *   - `images`    (0..3 binary parts)
 * Anything else — `image`, `complaintData`, etc. — 400s with
 * "Required part not present".
 */
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { customFetch, type Schemas } from '@complaints/api';

export interface SubmitComplaintArgs {
  complaint: Schemas.SubmitComplaintRequest;
  /** Already-compressed image files. 0..3, ≤ 1 MB each, image/jpeg or image/png. */
  images: readonly File[];
}

export type SubmitComplaintFetchResult = {
  status: number;
  data: Schemas.ApiResponseSubmitComplaintResponse;
  headers: Headers;
};

export async function submitComplaintMultipart(
  args: SubmitComplaintArgs,
): Promise<SubmitComplaintFetchResult> {
  const form = new FormData();
  form.append(
    'complaint',
    new Blob([JSON.stringify(args.complaint)], { type: 'application/json' }),
  );
  for (const file of args.images) {
    // Pass the File through unchanged so the browser sets the right
    // image/jpeg or image/png Content-Type on the part — the BE checks
    // it server-side.
    form.append('images', file, file.name);
  }
  return customFetch<SubmitComplaintFetchResult>('/api/v1/consumer/complaints', {
    method: 'POST',
    body: form,
    // Important: do NOT set Content-Type. The browser will set the
    // multipart boundary header on its own; specifying anything here
    // strips the boundary and the BE rejects the body as malformed.
  });
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

