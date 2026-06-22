/**
 * Image-picker helpers — client-side validation + compression.
 *
 * The flow per image:
 *   1. Validate MIME (image/jpeg or image/png) and bail with a typed code
 *      so the screen can show the localized message.
 *   2. If already under the post-compression cap (1 MB), pass through.
 *   3. Otherwise lazy-load `browser-image-compression` (NOT in the
 *      consumer route's initial chunk — split via dynamic import) and
 *      reduce until ≤ 1 MB or compression refuses.
 *
 * If compression returns a file still over the cap, surface
 * `IMAGE_TOO_LARGE` — the user picked something the library couldn't
 * shrink (e.g. a near-empty image with no entropy, or a HEIC that the
 * library can't fully transcode). The BE has the same hard cap; better
 * to fail here with a friendly message than 1 MB upload + 400.
 */

export const MAX_IMAGE_BYTES = 1 * 1024 * 1024; // 1 MB, post-compression
export const MAX_IMAGES_PER_COMPLAINT = 3;
export const ALLOWED_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png'];

export type ImageRejectionCode =
  | 'IMAGE_INVALID_TYPE'
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_LIMIT_EXCEEDED'
  | 'IMAGE_COMPRESSION_FAILED';

export class ImagePickError extends Error {
  readonly code: ImageRejectionCode;
  constructor(code: ImageRejectionCode, message?: string) {
    super(message ?? code);
    this.name = 'ImagePickError';
    this.code = code;
  }
}

/**
 * Validate + compress a single file. Returns a File ready for upload.
 * Throws `ImagePickError` on rejection. The browser-image-compression
 * import is dynamic so it doesn't land in the consumer landing chunk —
 * we only need the library once the user is on /consumer/submit and has
 * picked an image.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new ImagePickError('IMAGE_INVALID_TYPE');
  }
  if (file.size <= MAX_IMAGE_BYTES) {
    return file;
  }
  let compressed: File;
  try {
    const { default: imageCompression } = await import(
      'browser-image-compression'
    );
    compressed = await imageCompression(file, {
      maxSizeMB: MAX_IMAGE_BYTES / (1024 * 1024),
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      // Preserve the original MIME so the BE still sees jpeg/png — the
      // library converts to JPEG by default which would silently change
      // the part's Content-Type.
      fileType: file.type,
    });
  } catch (err) {
    throw new ImagePickError(
      'IMAGE_COMPRESSION_FAILED',
      err instanceof Error ? err.message : undefined,
    );
  }
  if (compressed.size > MAX_IMAGE_BYTES) {
    throw new ImagePickError('IMAGE_TOO_LARGE');
  }
  return compressed;
}

/** Validate the *count* before running compression on N files. */
export function assertImageCount(picked: number, existing: number): void {
  if (picked + existing > MAX_IMAGES_PER_COMPLAINT) {
    throw new ImagePickError('IMAGE_LIMIT_EXCEEDED');
  }
}

