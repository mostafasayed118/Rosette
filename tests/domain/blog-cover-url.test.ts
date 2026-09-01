import { describe, expect, it } from 'vitest';
import { validateCoverImageUrl, COVER_IMAGE_HOSTS } from '@/features/blog/cover-url';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('validateCoverImageUrl', () => {
  it('accepts empty values (covers are optional)', () => {
    expect(validateCoverImageUrl(null)).toBeNull();
    expect(validateCoverImageUrl(undefined)).toBeNull();
    expect(validateCoverImageUrl('')).toBeNull();
    expect(validateCoverImageUrl('   ')).toBeNull();
  });

  it('accepts every host in next.config.ts remotePatterns', () => {
    expect(validateCoverImageUrl('https://images.unsplash.com/photo-1')).toBeNull();
    expect(validateCoverImageUrl('https://lh3.googleusercontent.com/a/b')).toBeNull();
    expect(validateCoverImageUrl('https://vwjqtwxqangblapnmtbm.supabase.co/storage/v1/object/public/x.jpg')).toBeNull();
  });

  it('rejects non-https schemes', () => {
    expect(validateCoverImageUrl('http://images.unsplash.com/a.jpg')).toBe('scheme');
    expect(validateCoverImageUrl('javascript:alert(1)')).toBe('scheme');
    expect(validateCoverImageUrl('data:image/png;base64,AAAA')).toBe('scheme');
  });

  it('rejects hosts outside remotePatterns (next/image would throw at render)', () => {
    expect(validateCoverImageUrl('https://evil.example.com/payload.jpg')).toBe('host');
    expect(validateCoverImageUrl('https://supabase.co.evil.com/x.jpg')).toBe('host');
  });

  it('rejects malformed URLs', () => {
    expect(validateCoverImageUrl('not-a-url')).toBe('invalid');
    expect(validateCoverImageUrl('https://')).toBe('invalid');
  });
});

describe('COVER_IMAGE_HOSTS stays in sync with next.config.ts remotePatterns', () => {
  it('contains exactly the literal hosts from the config', () => {
    const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8');
    expect(COVER_IMAGE_HOSTS).toEqual(['images.unsplash.com', 'lh3.googleusercontent.com']);
    expect(config).toMatch(/hostname: 'images\.unsplash\.com'/);
    expect(config).toMatch(/hostname: 'lh3\.googleusercontent\.com'/);
  });
});
