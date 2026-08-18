import { describe, expect, it } from 'vitest';
import { localizedExcerpt, localizedTitle } from '@/features/blog/localized';
import { estimateReadingTime } from '@/features/blog/reading-time';
import type { BlogPostSummary } from '@/features/blog/types';

const post = {
  titleEn: 'How flower delivery works',
  titleAr: 'كيف تعمل خدمة توصيل الزهور',
  titleFr: 'Comment fonctionne la livraison de fleurs',
  excerptEn: Array.from({ length: 400 }, () => 'word').join(' '),
  excerptAr: 'المقتطف العربي',
  excerptFr: 'Un extrait court en français',
} as Pick<BlogPostSummary, 'titleEn' | 'titleAr' | 'titleFr' | 'excerptEn' | 'excerptAr' | 'excerptFr'>;

describe('localizedExcerpt', () => {
  it('uses the French excerpt for the fr locale', () => {
    expect(localizedExcerpt(post, 'fr')).toBe(post.excerptFr);
  });

  it('uses the Arabic excerpt for the ar locale', () => {
    expect(localizedExcerpt(post, 'ar')).toBe(post.excerptAr);
  });

  it('uses the English excerpt for the en locale even when others exist', () => {
    expect(localizedExcerpt(post, 'en')).toBe(post.excerptEn);
  });

  it('falls back to the English excerpt when French is missing', () => {
    const withoutFr = { ...post, excerptFr: undefined };
    expect(localizedExcerpt(withoutFr, 'fr')).toBe(post.excerptEn);
  });

  it('estimates reading time from the French excerpt, not the English one', () => {
    expect(estimateReadingTime(localizedExcerpt(post, 'fr'))).toBe(1);
    expect(estimateReadingTime(localizedExcerpt(post, 'en'))).toBe(2);
  });
});

describe('localizedTitle', () => {
  it('picks the localized title per locale', () => {
    expect(localizedTitle(post, 'fr')).toBe(post.titleFr);
    expect(localizedTitle(post, 'ar')).toBe(post.titleAr);
    expect(localizedTitle(post, 'en')).toBe(post.titleEn);
  });

  it('falls back to the English title when French is missing', () => {
    const withoutFr = { ...post, titleFr: undefined };
    expect(localizedTitle(withoutFr, 'fr')).toBe(post.titleEn);
  });
});
