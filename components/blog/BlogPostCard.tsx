import Link from 'next/link';
import { estimateReadingTime } from '@/features/blog/reading-time';
import { localizedExcerpt, localizedTitle } from '@/features/blog/localized';
import type { BlogPostSummary } from '@/features/blog/types';
import type { Locale } from '@/features/i18n/types';

export function BlogPostCard({ post, locale, city, t }: { post: BlogPostSummary; locale: Locale; city: string; t: (key: string, values?: Record<string, string | number>) => string }) {
  const excerpt = localizedExcerpt(post, locale);
  const minutes = estimateReadingTime(excerpt);
  return <Link className="group flex flex-col rounded-2xl border border-border p-6 transition-colors hover:border-primary" href={`/${locale}/${city}/blog/${post.slug}`} key={post.id}>
    <span className="text-xs font-bold uppercase tracking-[.16em] text-sage">{post.category ? t(`blogCategory_${post.category}`) : t('blogCategory_guides')} · {t('minRead', { count: minutes })}</span>
    <span className="mt-2 font-display text-2xl leading-tight text-foreground group-hover:text-primary">{localizedTitle(post, locale)}</span>
    <span className="mt-2 line-clamp-3 text-sm text-muted-foreground">{excerpt}</span>
  </Link>;
}
