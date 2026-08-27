export type ReviewPhotoInput = { name: string; type: string; size: number; bytes: ArrayBuffer };
export type ReviewPhotoValidation = { ok: true; photos: ReviewPhotoInput[] } | { ok: false; reason: 'too_many' | 'too_large' | 'invalid_type' };

export const REVIEW_PHOTO_MAX = 3;
export const REVIEW_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function hasValidMagicBytes(file: ReviewPhotoInput): boolean {
  const bytes = new Uint8Array(file.bytes);
  if (file.type === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.type === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (file.type === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 && // R
      bytes[1] === 0x49 && // I
      bytes[2] === 0x46 && // F
      bytes[3] === 0x46 && // F
      bytes[8] === 0x57 && // W
      bytes[9] === 0x45 && // E
      bytes[10] === 0x42 && // B
      bytes[11] === 0x50 // P
    );
  }
  return false;
}

export function validateReviewPhotos(files: ReviewPhotoInput[]): ReviewPhotoValidation {
  if (files.length > REVIEW_PHOTO_MAX) return { ok: false, reason: 'too_many' };
  if (files.some((file) => file.size > REVIEW_PHOTO_MAX_BYTES)) return { ok: false, reason: 'too_large' };
  if (files.some((file) => !(REVIEW_PHOTO_TYPES as readonly string[]).includes(file.type))) return { ok: false, reason: 'invalid_type' };
  if (files.some((file) => !hasValidMagicBytes(file))) return { ok: false, reason: 'invalid_type' };
  return { ok: true, photos: files };
}

export function isReviewImageUrl(url: unknown): url is string {
  return typeof url === 'string' && url.includes('/storage/v1/object/public/review-images/');
}

export function reviewImagePathFromUrl(url: string): string | null {
  const marker = '/review-images/';
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return url.slice(index + marker.length);
}

type ReviewStorage = { from: (bucket: string) => { upload: (path: string, bytes: ArrayBuffer, options: { contentType: string }) => Promise<{ error: unknown }>; getPublicUrl: (path: string) => { data: { publicUrl: string } } } };

export async function uploadReviewPhotos(storage: ReviewStorage, files: ReviewPhotoInput[]): Promise<{ urls: string[] }> {
  const bucket = storage.from('review-images');
  const urls: string[] = [];
  for (const file of files) {
    const ext = EXT_BY_TYPE[file.type] ?? 'bin';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await bucket.upload(path, file.bytes, { contentType: file.type });
    if (error) throw new Error('upload_failed');
    const { data } = bucket.getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return { urls };
}
