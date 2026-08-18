import { pickLocalized } from '@/features/i18n/pick';
import type { Locale } from '@/features/i18n/types';
import type { BlogPostSummary } from './types';

type LocalizedSummary = Pick<BlogPostSummary, 'titleEn' | 'titleAr' | 'titleFr' | 'excerptEn' | 'excerptAr' | 'excerptFr'>;

export function localizedExcerpt(post: LocalizedSummary, locale: Locale): string {
  return pickLocalized(locale, {
    en: post.excerptEn ?? '',
    ar: post.excerptAr ?? post.excerptEn ?? '',
    fr: post.excerptFr ?? post.excerptEn ?? '',
  });
}

export function localizedTitle(post: LocalizedSummary, locale: Locale): string {
  return pickLocalized(locale, {
    en: post.titleEn,
    ar: post.titleAr ?? post.titleEn,
    fr: post.titleFr ?? post.titleEn,
  });
}
