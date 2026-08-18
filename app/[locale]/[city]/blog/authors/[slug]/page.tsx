import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { BlogPostCard } from '@/components/blog/BlogPostCard';
import { PersonJsonLd } from '@/components/seo/PersonJsonLd';
import { getBlogRepository } from '@/features/blog/provider';
import { pickLocalized } from '@/features/i18n/pick';
import { getServerT } from '@/features/i18n/server';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import type { Locale } from '@/features/i18n/types';

type AuthorPageParams = { params: Promise<{ locale: string; city: string; slug: string }> };

const getAuthor = cache((slug: string) => getBlogRepository().getAuthorBySlug(slug));

export async function generateMetadata({ params }: AuthorPageParams): Promise<Metadata> {
  const { locale, city, slug } = await params;
  const author = await getAuthor(slug);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'https://rosette.fly.dev').replace(/\/$/, '');
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  if (!author) return { title: 'Not found' };
  const name = pickLocalized(resolvedLocale, { en: author.nameEn, ar: author.nameAr ?? author.nameEn, fr: author.nameFr ?? author.nameEn });
  const description = pickLocalized(resolvedLocale, { en: author.bioEn ?? '', ar: author.bioAr ?? author.bioEn ?? '', fr: author.bioFr ?? author.bioEn ?? '' }) || name;
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = `${base}/${l}/${city}/blog/authors/${author.slug}`;
  return { title: name, description, alternates: { canonical: `${base}/${resolvedLocale}/${city}/blog/authors/${author.slug}`, languages } };
}

export default async function AuthorPage({ params }: AuthorPageParams) {
  const { locale: localeRaw, city, slug } = await params;
  const { t } = await getServerT();
  const locale: Locale = (LOCALES as string[]).includes(localeRaw) ? (localeRaw as Locale) : 'en';
  const author = await getAuthor(slug);
  if (!author) return <main className="mx-auto grid min-h-[70vh] w-[min(calc(100%-3rem),80rem)] place-content-center justify-items-start"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('notFoundEyebrow')}</p><h1 className="mt-2 mb-6 max-w-[12ch] font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95]">{t('notFoundTitle')}</h1><Link className="text-sm text-primary underline underline-offset-4" href={`/${locale}/${city}/blog/authors`}>← {t('authorsIndexTitle')}</Link></main>;
  const name = pickLocalized(locale, { en: author.nameEn, ar: author.nameAr ?? author.nameEn, fr: author.nameFr ?? author.nameEn });
  const role = pickLocalized(locale, { en: author.roleEn ?? '', ar: author.roleAr ?? '', fr: author.roleFr ?? '' });
  const bio = pickLocalized(locale, { en: author.bioEn ?? '', ar: author.bioAr ?? author.bioEn ?? '', fr: author.bioFr ?? author.bioEn ?? '' });
  const posts = await getBlogRepository().listPublished({ type: 'post', authorId: author.id });
  const base = (getOptionalServerEnv('SITE_URL') ?? 'https://rosette.fly.dev').replace(/\/$/, '');
  return <div className="flex min-h-screen flex-col"><PersonJsonLd name={name} url={`${base}/${locale}/${city}/blog/authors/${author.slug}`} jobTitle={role || undefined} description={bio || undefined} image={author.avatarUrl} /><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),50rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),50rem)] max-md:pt-4"><Link className="text-sm text-primary underline underline-offset-4" href={`/${locale}/${city}/blog/authors`}>← {t('authorsIndexTitle')}</Link><div className="mt-8 flex items-start gap-5">{author.avatarUrl ? <img src={author.avatarUrl} alt="" width={80} height={80} loading="lazy" className="h-20 w-20 rounded-full object-cover" /> : <span aria-hidden="true" className="grid h-20 w-20 place-items-center rounded-full bg-accent font-display text-2xl text-primary">{name.slice(0, 1)}</span>}<div><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('authorsEyebrow')}</p><h1 className="mt-1 font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em] text-primary">{name}</h1>{role ? <p className="mt-1 text-muted-foreground">{role}</p> : null}</div></div>{bio ? <p className="mt-6 max-w-prose text-[1.05rem] leading-relaxed text-muted-foreground">{bio}</p> : null}{posts.length ? <div className="mt-12"><h2 className="font-display text-2xl leading-tight text-foreground">{t('postsByAuthor', { name })}</h2><div className="mt-6 grid gap-6 md:grid-cols-2">{posts.map((post) => <BlogPostCard key={post.id} post={post} locale={locale} city={city} t={t} />)}</div></div> : <p className="mt-12 text-sm text-muted-foreground">{t('noPostsByAuthor')}</p>}</main><SiteFooter locale={locale} city={city} /></div>;
}
