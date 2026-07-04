/**
 * Image-picker helpers for the mobile submit form — RN twin of
 * `apps/web/src/features/consumer/imageCompression.ts`.
 *
 * Web uses `browser-image-compression` (canvas-based, browser-only).
 * On mobile the equivalent is `expo-image-manipulator` (native, backed
 * by CoreImage / Android's ImageDecoder), sized via
 * `expo-file-system.getInfoAsync`.
 *
 * Flow per asset:
 *   1. Validate MIME (image/jpeg or image/png). HEIC etc. are rejected
 *      here — the BE enforces the same allow-list, so failing fast with
 *      a friendly message is nicer than a 400 after a 1 MB upload.
 *   2. If already ≤ 1 MB (post-compression cap), pass through.
 *   3. Otherwise `manipulateAsync` with resize(1920) + compress(0.6),
 *      preserving JPEG-vs-PNG. If the result is still over cap, surface
 *      `IMAGE_TOO_LARGE` — same contract as web, same i18n key.
 *
 * Return shape is deliberately the RN FormData file part:
 *   `{ uri, name, type }`
 * so the caller (`submitComplaint.ts`) can `form.append('images', part)`
 * without adapting types.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';

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

/** Ready-to-upload multipart file part in RN's `{uri, name, type}` shape. */
export interface PreparedImage {
  uri: string;
  name: string;
  type: 'image/jpeg' | 'image/png';
}

function inferMime(asset: ImagePickerAsset): string | null {
  // expo-image-picker sometimes omits `mimeType` (older Android). Fall
  // back to the file extension so a lower-case `.jpg` still routes to
  // image/jpeg. Anything unrecognised → null → IMAGE_INVALID_TYPE.
  if (asset.mimeType) return asset.mimeType;
  const uri = asset.uri.toLowerCase();
  if (uri.endsWith('.jpg') || uri.endsWith('.jpeg')) return 'image/jpeg';
  if (uri.endsWith('.png')) return 'image/png';
  return null;
}

async function fileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  // `size` is present when `exists: true`. Belt-and-braces: default to
  // Number.POSITIVE_INFINITY so a missing size doesn't get treated as
  // "already small enough" and skip the compression step.
  if (!info.exists) return Number.POSITIVE_INFINITY;
  return typeof info.size === 'number' ? info.size : Number.POSITIVE_INFINITY;
}

/**
 * Validate + (if needed) compress a single picked asset. Throws
 * `ImagePickError` on rejection. One compression pass — matches the web
 * heuristic. Users who pick an image the library can't shrink under
 * 1 MB get IMAGE_TOO_LARGE and are asked to pick something else.
 */
export async function prepareImageForUpload(
  asset: ImagePickerAsset,
): Promise<PreparedImage> {
  const mime = inferMime(asset);
  if (!mime || !ALLOWED_MIME_TYPES.includes(mime)) {
    throw new ImagePickError('IMAGE_INVALID_TYPE');
  }

  const currentSize =
    typeof asset.fileSize === 'number' ? asset.fileSize : await fileSize(asset.uri);

  const name =
    asset.fileName ??
    (mime === 'image/png' ? 'photo.png' : 'photo.jpg');

  if (currentSize <= MAX_IMAGE_BYTES) {
    return { uri: asset.uri, name, type: mime as PreparedImage['type'] };
  }

  let manipulated: ImageManipulator.ImageResult;
  try {
    manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1920 } }],
      {
        compress: 0.6,
        format:
          mime === 'image/png'
            ? ImageManipulator.SaveFormat.PNG
            : ImageManipulator.SaveFormat.JPEG,
      },
    );
  } catch (err) {
    throw new ImagePickError(
      'IMAGE_COMPRESSION_FAILED',
      err instanceof Error ? err.message : undefined,
    );
  }

  const compressedSize = await fileSize(manipulated.uri);
  if (compressedSize > MAX_IMAGE_BYTES) {
    throw new ImagePickError('IMAGE_TOO_LARGE');
  }
  return { uri: manipulated.uri, name, type: mime as PreparedImage['type'] };
}

/** Validate the *count* before running compression on N assets. */
export function assertImageCount(picked: number, existing: number): void {
  if (picked + existing > MAX_IMAGES_PER_COMPLAINT) {
    throw new ImagePickError('IMAGE_LIMIT_EXCEEDED');
  }
}

