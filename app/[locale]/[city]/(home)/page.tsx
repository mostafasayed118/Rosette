import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { LocalBusinessJsonLd, OrganizationJsonLd } from '@/components/seo/SiteJsonLd';
import { getCityBySlug } from '@/features/destination/data';
import { getServerT } from '@/features/i18n/server';
import { pickLocalized } from '@/features/i18n/pick';
import { formatMoney } from '@/features/money';
import { buildLocalizedPageMetadata } from '@/features/seo/page-metadata';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import type { Locale } from '@/features/i18n/types';

type HomePageParams = { params: Promise<{ locale: string; city: string }> };

export async function generateMetadata({ params }: HomePageParams): Promise<Metadata> {
  const { locale, city } = await params;
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  const { t } = await getServerT(resolvedLocale);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  return buildLocalizedPageMetadata({ locale: resolvedLocale, city, path: '', base, title: t('homeTitle'), description: t('homeLede') });
}

const HERO_IMAGE_URL = 'https://images.unsplash.com/photo-1519378058457-4c29a0a2efac?w=1400&q=80&auto=format&fit=crop';
const HERO_INLINE_IMAGE = 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?w=400&q=80&auto=format&fit=crop';

// `price` is an integer amount in minor units (piastres); formatMoney renders
// it with Intl.NumberFormat for the active locale.
const FEATURED = [
  { nameKey: 'featuredNameWhiteEdit', price: 125000, badgeKey: 'featuredBadgeSameDayMaadi', tone: 'bg-secondary-fixed text-on-secondary-fixed', image: 'https://vwjqtwxqangblapnmtbm.supabase.co/storage/v1/object/public/product-images/quiet-orchid.jpg' },
  { nameKey: 'featuredNameCrimsonDusk', price: 180000, badgeKey: 'featuredBadgePreorder', tone: 'bg-surface text-on-surface border border-outline-variant/50', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAjWpVXFBrHUZGg8hO-EX4qDrZds2C_EirJarIoCltxQDrYTrscELtUcBOnSubAlLRc7y-lEp1bZ8_lUNENAVHs0WX33BjxhHNKL6ex2SLYlkau4FHfuGYxwXWyQJFswyVDvf-0zvMKNWNDOVSCJuJKlL11FY5Ss993Mkt9SgpMcHj_O0rvqU2yf62LQKRy1Xm8M9D-gdDravxVNGYwzbcmn1gShfRrrKC3obEHbL9YH_HYFGA9Bx6w0Q' },
  { nameKey: 'featuredNameMorningLight', price: 95000, badgeKey: 'featuredBadgeSameDayZamalek', tone: 'bg-secondary-fixed text-on-secondary-fixed', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB-Na_m69g9KR_gYtTh8ZsYfuGx7NfYkueSBKPYw-zL1pDuYMyoseUv22aqMufZUJxbgcmyFdaNZbDl0kGhDL-CG6STgHOzzD5NrcMxrw8kNgE3CQaPTwaDlaiudGcGxNHB3lJMQNNraoeqXMuyaoQT5-plwUN1DW7Mq7DSPoVsIFXCt-6i7EaWIL7hwSLE4rPmeE0ouTpH8zLUyqi3-IAYBp92W-XXWUHMyWPGYLbhPtK9IbsZTwcV9A' },
  { nameKey: 'featuredNameSingleStem', price: 35000, badgeKey: null, tone: '', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuALY3RjltXeVtH7Yj-nHdoF2ptyfhKduUUh1S9DuBuGr_GDzcz-2Vb2ArTwx7hYI-q4fh5xZYUzSCzC_GqjLHZRuAMZ8ks2F8AysutEuj6QBVvurWvZrN6wnyFqInAQGIJWL5wXFExUH49Fqe2pp_D73pbJAQBpdi7k2ayRH3xs33n86bIgxhdsQONdlW_mb0oloWxHgYzmNR5yq6AdDZBwTcVP7LVHt6fDrMCHVwcfq9xxvqO2giAnNA' },
];

const FEELINGS = [
  { labelKey: 'gestureForLove', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD9aRUsPLc7F_PnSCnvzzqYRjhoyMse-b1W6D0SwqKCAszos616iOqCUjWaY3Ya67XvOg05K1JQk9b_sTHVXIGCyllHW6lS_oAlIhkkfmJ4TPI5RBZNjtPzSAFVFiU8BVKc6AC8MSusNHrD_GU1ujDnuGX1KbovnH93wiLda_wSZanm3CE06XJeWPQFRSQcEJCAJzae4CHLjirtbmpnhtdzDlN7dwH6e4lhcij8pIImZqiflg9tm-vVpg', aspect: 'aspect-[4/3]' },
  { labelKey: 'gestureSympathy', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDxqxZl5uLWdPdRLE9uahvEchSPiN4SXWnByXt_vbkuXIbCCveP2P2rfyPCCNPhgdcUKwyEhWmmkS43PuKtF_Q7EziyUgxL8YDlv2NeY2_ChcfUwMI1nM11ooD9cnNao-DofJS4bQZg_8xGwb6dLqGJj80GZSlv1XsgWS_zQDX4Hz5FNhOuRWogN9RdlKOijkpPgw6JbZFEsJiPLJBgW-ak2HMmr7lVeTaaIITLh_P0pUE0_PEKsqb2tw', aspect: 'aspect-square', offset: 'md:ml-12' },
  { labelKey: 'gestureBirthdays', image: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=600&q=80&auto=format&fit=crop', aspect: 'aspect-square', offset: 'md:mr-12' },
  { labelKey: 'gestureJustBecause', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuASJkJVcDGq2xJ-m_75JshUMNd5o3sjg8h4EM8f23N2pEFqI37zreODcaePB_HaKf2sPfOQb03m91VM_U3yRwvc0jTg4Mu26o-v-6V2lqGOoAv-cZ2wJ3LMh16-JGnLX4Yfr1VMIU7M3fXgYZa0IWRPf1MWhGK1vcPb2vm1BO2bAb-MfT-pHYLyDjaBHgJAmxCtaK60OENtm9WRTuuwvCwBJTgTYYJeDb911OtIhVP-yYNfMswsIALLSQ', aspect: 'aspect-[4/5]', offset: '' },
];

export default async function HomePage({ params }: HomePageParams) {
  const { locale: localeSegment, city: cityCode } = await params;
  const { locale, t } = await getServerT(localeSegment);
  const city = getCityBySlug(cityCode);
  const cityName = city ? pickLocalized(locale, { en: city.name, ar: city.nameAr, fr: city.nameFr }) : undefined;
  const titleWords = t('homeTitle').split(' ');
  const inlineAt = Math.min(3, Math.max(1, titleWords.length - 2));
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');

  return (
    <div className="flex min-h-screen flex-col">
      <OrganizationJsonLd base={base} locale={locale} />
      {cityName ? <LocalBusinessJsonLd base={base} locale={locale} cityName={cityName} citySlug={cityCode} /> : null}
      <SiteHeader cityName={cityName} />
      <main id="main-content" className="flex-grow">
        {/* Hero */}
        <section className="mx-auto max-w-[1280px] px-5 pb-16 pt-12 md:px-[64px] md:pb-24 md:pt-32">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="stagger-item lg:col-span-5 order-2 lg:order-1 pt-10 lg:pt-0 lg:pl-8">
              <span className="uppercase tracking-[0.18em] text-xs font-semibold text-tertiary mb-7 block">{t('homeEyebrow')}</span>
              <h1 className="font-display text-[42px] lg:text-[64px] font-semibold leading-[1.08] tracking-[-0.025em] text-on-surface mb-9">
                {titleWords.slice(0, inlineAt + 1).join(' ')}{' '}
                <span className="relative inline-block align-middle mx-2 w-16 h-12 md:w-24 md:h-16 rounded-full overflow-hidden border border-outline-variant/50 shadow-[0_8px_20px_-8px_rgb(58_20_30_/_25%)]">
                  <Image src={HERO_INLINE_IMAGE} alt="" aria-hidden="true" fill sizes="96px" priority className="object-cover" />
                </span>{' '}
                {titleWords.slice(inlineAt + 1).join(' ')}
              </h1>
              <p className="text-[18px] leading-[1.7] text-on-surface-variant mb-11 max-w-lg">{t('homeLede')}</p>
              <Link href={`/${locale}/${cityCode}/shop`} className="lift press inline-flex items-center gap-2 rounded-full bg-primary px-9 py-4 text-sm font-semibold text-on-primary transition-colors hover:bg-on-primary-fixed-variant">
                {t('explore')} <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
            <div className="stagger-item lg:col-span-7 order-1 lg:order-2 flex justify-end">
              <div className="relative w-full md:w-4/5 lg:w-full aspect-[4/5] overflow-hidden rounded-[1.25rem] border border-outline-variant/30 bg-surface-container-low p-2 md:p-4 shadow-[0_28px_64px_-24px_rgb(58_20_30_/_22%)]">
                <div className="relative h-full w-full overflow-hidden rounded-lg">
                  <Image src={HERO_IMAGE_URL} alt={t('heroImageAlt')} fill sizes="(max-width: 1024px) 80vw, 55vw" priority className="object-cover" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Featured gestures */}
        <section className="border-y border-outline-variant/25 bg-surface-container-low py-16 md:py-24">
          <div className="mx-auto flex max-w-[1280px] items-end justify-between px-5 md:px-[64px] mb-8 md:mb-12">
            <h2 className="font-display text-[28px] font-medium tracking-[-0.01em] text-on-surface">{t('featuredGestures')}</h2>
          </div>
          <div className="hide-scrollbar relative w-full overflow-x-auto pb-10">
            <div className="flex w-max gap-8 px-5 md:px-[64px]">
              {FEATURED.map((card) => {
                const name = t(card.nameKey);
                const badge = card.badgeKey ? t(card.badgeKey) : null;
                return (
                <Link key={card.nameKey} href={`/${locale}/${cityCode}/shop`} className="stagger-item group w-[280px] md:w-[320px] cursor-pointer">
                  <div className="ambient-glow relative mb-5 aspect-[3/4] overflow-hidden rounded-[1rem] border border-outline-variant/30 bg-surface">
                    {badge ? <span className={`absolute start-3 top-3 z-10 rounded-full px-3 py-1 text-xs font-semibold ${card.tone}`}>{badge}</span> : null}
                    <Image src={card.image} alt={name} fill sizes="(max-width: 768px) 280px, 320px" className="object-cover transition-transform duration-700 group-hover:scale-[1.06]" />
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-lg text-on-surface transition-colors group-hover:text-primary">{name}</h3>
                    <span className="price text-sm tracking-[0.05em] text-on-surface-variant">{formatMoney(card.price, locale)}</span>
                  </div>
                </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Gift finder prompt */}
        <section className="mx-auto max-w-[1280px] px-5 py-14 md:px-[64px] md:py-20">
          <div className="ambient-glow flex flex-col items-center gap-5 rounded-[1.25rem] border border-outline-variant/30 bg-surface-container-low px-6 py-10 text-center md:px-20 md:py-14">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-tertiary">{t('giftFinderHomeEyebrow')}</p>
            <h2 className="max-w-xl font-display text-[32px] leading-tight tracking-[-0.015em] text-on-surface">{t('giftFinderTitle')}</h2>
            <p className="max-w-lg text-on-surface-variant">{t('giftFinderLede')}</p>
            <Link href={`/${locale}/${cityCode}/gift-finder`} className="lift press mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-on-primary-fixed-variant">
              {t('giftFinderStart')} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Editorial split */}
        <section className="mx-auto mb-16 mt-10 max-w-[1280px] px-5 py-16 md:mb-32 md:mt-16 md:px-[64px] md:py-24">
          <div className="mb-10 text-center md:mb-20">
            <h2 className="font-display text-[32px] md:text-[38px] font-medium leading-[1.2] tracking-[-0.015em] text-on-surface mb-5">
              {t('editorialTitle')}
            </h2>
            <div className="mx-auto h-px w-16 bg-outline-variant" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-20 items-start">
            <div className="flex flex-col gap-10 pt-0 md:gap-16 md:pt-28">
              {FEELINGS.slice(0, 2).map((feeling) => (
                <Link key={feeling.labelKey} href={`/${locale}/${cityCode}/shop`} className={`stagger-item ambient-glow group relative block overflow-hidden rounded-[1rem] border border-outline-variant/25 bg-surface p-2 ${feeling.offset}`}>
                  <div className={`relative ${feeling.aspect} overflow-hidden rounded-lg`}>
                    <Image src={feeling.image} alt={t(feeling.labelKey)} fill sizes="(max-width: 768px) 100vw, 45vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.06]" />
                  </div>
                  <span className="absolute bottom-6 left-6 right-6 flex items-center justify-between rounded-lg border border-outline-variant/30 bg-surface/92 p-4 backdrop-blur-md">
                    <span className="font-display text-xl text-on-surface transition-colors group-hover:text-primary">{t(feeling.labelKey)}</span>
                    <ArrowRight className="h-5 w-5 text-primary transition-transform duration-300 group-hover:translate-x-1.5" />
                  </span>
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-10 pt-8 md:gap-16 md:pt-0">
              {FEELINGS.slice(2, 4).map((feeling) => (
                <Link key={feeling.labelKey} href={`/${locale}/${cityCode}/shop`} className={`stagger-item ambient-glow group relative block overflow-hidden rounded-[1rem] border border-outline-variant/25 bg-surface p-2 ${feeling.offset}`}>
                  <div className={`relative ${feeling.aspect} overflow-hidden rounded-lg`}>
                    <Image src={feeling.image} alt={t(feeling.labelKey)} fill sizes="(max-width: 768px) 100vw, 45vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.06]" />
                  </div>
                  <span className="absolute bottom-6 left-6 right-6 flex items-center justify-between rounded-lg border border-outline-variant/30 bg-surface/92 p-4 backdrop-blur-md">
                    <span className="font-display text-xl text-on-surface transition-colors group-hover:text-primary">{t(feeling.labelKey)}</span>
                    <ArrowRight className="h-5 w-5 text-primary transition-transform duration-300 group-hover:translate-x-1.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} city={cityCode} />
    </div>
  );
}
