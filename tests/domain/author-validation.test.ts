import { describe, expect, it } from 'vitest';
import { validateAuthorInput } from '@/features/admin/author-validation';
import type { AuthorInput } from '@/features/blog/types';

const base: AuthorInput = { slug: 'nour-hassan', nameEn: 'Nour Hassan' };

describe('validateAuthorInput', () => {
  it('accepts a valid slug and name', () => {
    expect(validateAuthorInput(base)).toBeNull();
  });

  it('rejects a missing name', () => {
    expect(validateAuthorInput({ ...base, nameEn: ' ' })).toBe('names_required');
  });

  it('rejects an empty slug', () => {
    expect(validateAuthorInput({ ...base, slug: '   ' })).toBe('slug_required');
  });

  it('rejects slugs containing spaces or uppercase letters', () => {
    expect(validateAuthorInput({ ...base, slug: 'nour hassan' })).toBe('invalid_slug');
    expect(validateAuthorInput({ ...base, slug: 'Nour-Hassan' })).toBe('invalid_slug');
  });

  it('rejects slugs with invalid characters', () => {
    expect(validateAuthorInput({ ...base, slug: 'nour_hassan' })).toBe('invalid_slug');
    expect(validateAuthorInput({ ...base, slug: 'nour@hassan' })).toBe('invalid_slug');
  });

  it('accepts surrounding whitespace on an otherwise valid slug', () => {
    expect(validateAuthorInput({ ...base, slug: ' nour-hassan ' })).toBeNull();
  });
});
