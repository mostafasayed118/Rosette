import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { AuthorByline } from '@/components/blog/AuthorByline';
import { BlogPostingJsonLd } from '@/components/seo/BlogPostingJsonLd';
import { getBlogRepository } from '@/features/blog/provider';
import { estimateReadingTime } from '@/features/blog/reading-time';
import { getServerT } from '@/features/i18n/server';
import { pickLocalized } from '@/features/i18n/pick';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import type { Locale } from '@/features/i18n/types';

type BlogPostPageParams = { params: Promise<{ locale: string; city: string; slug: string }> };

const getPost = cache((slug: string) => getBlogRepository().getBySlug(slug));

export async function generateMetadata({ params }: BlogPostPageParams): Promise<Metadata> {
  const { locale, city, slug } = await params;
  const post = await getPost(slug);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  if (!post) return { title: 'Not found' };
  const title = pickLocalized(resolvedLocale, { en: post.titleEn, ar: post.titleAr ?? post.titleEn, fr: post.titleFr ?? post.titleEn });
  const description = pickLocalized(resolvedLocale, { en: post.excerptEn ?? '', ar: post.excerptAr ?? post.excerptEn ?? '', fr: post.excerptFr ?? post.excerptEn ?? '' }) || title;
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = `${base}/${l}/${city}/blog/${post.slug}`;
  return { title, description, alternates: { canonical: `${base}/${resolvedLocale}/${city}/blog/${post.slug}`, languages } };
}

export default async function BlogPostPage({ params }: BlogPostPageParams) {
  const { locale: localeRaw, city, slug } = await params;
  const locale: Locale = (LOCALES as string[]).includes(localeRaw) ? (localeRaw as Locale) : 'en';
  const { t } = await getServerT(locale);
  const post = await getPost(slug);
  if (!post) return <main className="mx-auto grid min-h-[70vh] w-[min(calc(100%-3rem),80rem)] place-content-center justify-items-start"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('notFoundEyebrow')}</p><h1 className="mt-2 mb-6 max-w-[12ch] font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95]">{t('notFoundTitle')}</h1><Link className="text-sm text-primary underline underline-offset-4" href={`/${locale}/${city}/blog`}>← {t('blogTitle')}</Link></main>;
  const title = pickLocalized(locale, { en: post.titleEn, ar: post.titleAr ?? post.titleEn, fr: post.titleFr ?? post.titleEn });
  const content = pickLocalized(locale, { en: post.contentEn, ar: post.contentAr ?? post.contentEn, fr: post.contentFr ?? post.contentEn });
  const minutes = estimateReadingTime(content);
  const author = post.authorId ? await getBlogRepository().getAuthor(post.authorId) : null;
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  return <div className="flex min-h-screen flex-col"><BlogPostingJsonLd post={{ slug: post.slug, title, excerpt: post.excerptEn, publishedAt: post.publishedAt, updatedAt: post.updatedAt }} url={`${base}/${locale}/${city}/blog/${post.slug}`} /><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),50rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),50rem)] max-md:pt-4"><Link className="text-sm text-primary underline underline-offset-4" href={`/${locale}/${city}/blog`}>← {t('blogTitle')}</Link><p className="mt-8 text-xs font-bold uppercase tracking-[.16em] text-sage">{post.category ? t(`blogCategory_${post.category}`) : t('blogCategory_guides')} · {t('minRead', { count: minutes })}</p><h1 className="mt-2 font-display text-[clamp(2.25rem,5vw,3.5rem)] leading-[.98] tracking-[-.04em] text-primary">{title}</h1><div className="mt-8 space-y-4 text-[1.05rem] leading-relaxed text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1" dangerouslySetInnerHTML={{ __html: content }} /><AuthorByline author={author} locale={locale} city={city} /></main><SiteFooter locale={locale} city={city} /></div>;
}
