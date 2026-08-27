import { describe, expect, it, vi } from 'vitest';
import { isReviewImageUrl, reviewImagePathFromUrl, REVIEW_PHOTO_MAX_BYTES, uploadReviewPhotos, validateReviewPhotos, type ReviewPhotoInput } from '@/features/reviews/review-storage';

function validBytesFor(type: string): ArrayBuffer {
  if (type === 'image/jpeg') return new Uint8Array([0xff, 0xd8, 0xff, 0x00]).buffer;
  if (type === 'image/png') return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
  if (type === 'image/webp') return new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]).buffer;
  return new ArrayBuffer(4);
}

const photo = (overrides: Partial<ReviewPhotoInput> = {}): ReviewPhotoInput => {
  const type = (overrides.type as string) ?? 'image/jpeg';
  const base: ReviewPhotoInput = {
    name: 'a.jpg',
    type,
    size: 1024,
    bytes: validBytesFor(type),
  };
  const merged = { ...base, ...overrides };
  // If the test overrode the type but not the bytes, make bytes match the new type.
  if (overrides.type && !('bytes' in overrides)) merged.bytes = validBytesFor(overrides.type as string);
  return merged;
};

describe('validateReviewPhotos', () => {
  it('accepts up to 3 valid photos', () => {
    const files = [photo(), photo(), photo()];
    expect(validateReviewPhotos(files)).toEqual({ ok: true, photos: files });
  });
  it('rejects more than 3 photos', () => {
    expect(validateReviewPhotos([photo(), photo(), photo(), photo()])).toEqual({ ok: false, reason: 'too_many' });
  });
  it('rejects a photo over 5 MB', () => {
    expect(validateReviewPhotos([photo({ size: REVIEW_PHOTO_MAX_BYTES + 1 })])).toEqual({ ok: false, reason: 'too_large' });
  });
  it('rejects an unsupported type', () => {
    expect(validateReviewPhotos([photo({ type: 'image/gif' })])).toEqual({ ok: false, reason: 'invalid_type' });
  });
});

describe('uploadReviewPhotos', () => {
  it('uploads each file to review-images with its content type and returns public URLs', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-uuid' });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/review-images/${path}` } }));
    const storage = { from: (bucket: string) => ({ upload, getPublicUrl }) };
    const { urls } = await uploadReviewPhotos(storage, [photo({ type: 'image/png' }), photo({ name: 'b.webp', type: 'image/webp' })]);
    expect(upload).toHaveBeenCalledTimes(2);
    const [firstPath] = upload.mock.calls[0] as [string, ArrayBuffer, { contentType: string }];
    expect(firstPath).toMatch(/\.png$/);
    expect(upload.mock.calls[0]![2]).toEqual({ contentType: 'image/png' });
    expect(upload.mock.calls[1]![0]).toMatch(/\.webp$/);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('/storage/v1/object/public/review-images/');
    vi.unstubAllGlobals();
  });
});

describe('URL helpers', () => {
  it('isReviewImageUrl accepts bucket URLs and rejects others', () => {
    expect(isReviewImageUrl('https://x.supabase.co/storage/v1/object/public/review-images/a.jpg')).toBe(true);
    expect(isReviewImageUrl('https://evil.com/a.jpg')).toBe(false);
    expect(isReviewImageUrl(42)).toBe(false);
  });
  it('reviewImagePathFromUrl extracts the object path', () => {
    expect(reviewImagePathFromUrl('https://x.supabase.co/storage/v1/object/public/review-images/uuid.jpg')).toBe('uuid.jpg');
    expect(reviewImagePathFromUrl('https://evil.com/a.jpg')).toBeNull();
  });
});
