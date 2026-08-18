import type { AuthorInput } from '@/features/blog/types';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateAuthorInput(input: AuthorInput): string | null {
  if (!input.nameEn.trim()) return 'names_required';
  const slug = input.slug.trim();
  if (!slug) return 'slug_required';
  if (!SLUG_PATTERN.test(slug)) return 'invalid_slug';
  return null;
}
