import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { LocalizedPageHeading } from '@/features/i18n/LocalizedPageHeading';
import { getBlogRepository } from '@/features/blog/provider';
import { pickLocalized } from '@/features/i18n/pick';
import { buildLocalizedPageMetadata } from '@/features/seo/page-metadata';
import { getServerT } from '@/features/i18n/server';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import type { Locale } from '@/features/i18n/types';

type AuthorsPageParams = { params: Promise<{ locale: string; city: string }> };

export async function generateMetadata({ params }: AuthorsPageParams): Promise<Metadata> {
  const { locale, city } = await params;
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  const { t } = await getServerT(resolvedLocale);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  return buildLocalizedPageMetadata({ locale: resolvedLocale, city, path: '/blog/authors', base, title: t('authorsIndexTitle'), description: t('authorsIndexLede') });
}

export default async function AuthorsPage({ params }: AuthorsPageParams) {
  const { locale: localeRaw, city: citySlug } = await params;
  const locale: Locale = (LOCALES as string[]).includes(localeRaw) ? (localeRaw as Locale) : 'en';
  const { t } = await getServerT(locale);
  const authors = await getBlogRepository().listAuthors();
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><LocalizedPageHeading eyebrow="authorsEyebrow" title="authorsIndexTitle" lede="authorsIndexLede" /><div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{authors.map((author) => { const name = pickLocalized(locale, { en: author.nameEn, ar: author.nameAr ?? author.nameEn, fr: author.nameFr ?? author.nameEn }); const role = pickLocalized(locale, { en: author.roleEn ?? '', ar: author.roleAr ?? '', fr: author.roleFr ?? '' }); return <Link className="group flex flex-col rounded-2xl border border-border p-6 transition-colors hover:border-primary" href={`/${locale}/${citySlug}/blog/authors/${author.slug}`} key={author.id}>{author.avatarUrl ? <Image src={author.avatarUrl} alt="" width={64} height={64} loading="lazy" className="h-16 w-16 rounded-full object-cover" /> : <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-accent font-display text-xl text-primary">{name.slice(0, 1)}</span>}<span className="mt-4 font-display text-xl leading-tight text-foreground group-hover:text-primary">{name}</span>{role ? <span className="mt-1 text-sm text-muted-foreground">{role}</span> : null}</Link>; })}</div></main><SiteFooter locale={locale} city={citySlug} /></div>;
}
