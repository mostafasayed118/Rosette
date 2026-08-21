import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { getCityBySlug } from '@/features/destination/data';
import { getServerT } from '@/features/i18n/server';
import { pickLocalized } from '@/features/i18n/pick';
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

const FEATURED = [
  { name: 'The White Edit', price: 'EGP 1,250', badge: 'Same-day Maadi', tone: 'bg-secondary-fixed text-on-secondary-fixed', image: 'https://vwjqtwxqangblapnmtbm.supabase.co/storage/v1/object/public/product-images/quiet-orchid.jpg' },
  { name: 'Crimson Dusk', price: 'EGP 1,800', badge: 'Pre-order', tone: 'bg-surface text-on-surface border border-outline-variant/50', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAjWpVXFBrHUZGg8hO-EX4qDrZds2C_EirJarIoCltxQDrYTrscELtUcBOnSubAlLRc7y-lEp1bZ8_lUNENAVHs0WX33BjxhHNKL6ex2SLYlkau4FHfuGYxwXWyQJFswyVDvf-0zvMKNWNDOVSCJuJKlL11FY5Ss993Mkt9SgpMcHj_O0rvqU2yf62LQKRy1Xm8M9D-gdDravxVNGYwzbcmn1gShfRrrKC3obEHbL9YH_HYFGA9Bx6w0Q' },
  { name: 'Morning Light', price: 'EGP 950', badge: 'Same-day Zamalek', tone: 'bg-secondary-fixed text-on-secondary-fixed', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB-Na_m69g9KR_gYtTh8ZsYfuGx7NfYkueSBKPYw-zL1pDuYMyoseUv22aqMufZUJxbgcmyFdaNZbDl0kGhDL-CG6STgHOzzD5NrcMxrw8kNgE3CQaPTwaDlaiudGcGxNHB3lJMQNNraoeqXMuyaoQT5-plwUN1DW7Mq7DSPoVsIFXCt-6i7EaWIL7hwSLE4rPmeE0ouTpH8zLUyqi3-IAYBp92W-XXWUHMyWPGYLbhPtK9IbsZTwcV9A' },
  { name: 'Single Stem Gift', price: 'EGP 350', badge: null, tone: '', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuALY3RjltXeVtH7Yj-nHdoF2ptyfhKduUUh1S9DuBuGr_GDzcz-2Vb2ArTwx7hYI-q4fh5xZYUzSCzC_GqjLHZRuAMZ8ks2F8AysutEuj6QBVvurWvZrN6wnyFqInAQGIJWL5wXFExUH49Fqe2pp_D73pbJAQBpdi7k2ayRH3xs33n86bIgxhdsQONdlW_mb0oloWxHgYzmNR5yq6AdDZBwTcVP7LVHt6fDrMCHVwcfq9xxvqO2giAnNA' },
];

const FEELINGS = [
  { label: 'For Love', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD9aRUsPLc7F_PnSCnvzzqYRjhoyMse-b1W6D0SwqKCAszos616iOqCUjWaY3Ya67XvOg05K1JQk9b_sTHVXIGCyllHW6lS_oAlIhkkfmJ4TPI5RBZNjtPzSAFVFiU8BVKc6AC8MSusNHrD_GU1ujDnuGX1KbovnH93wiLda_wSZanm3CE06XJeWPQFRSQcEJCAJzae4CHLjirtbmpnhtdzDlN7dwH6e4lhcij8pIImZqiflg9tm-vVpg', aspect: 'aspect-[4/3]' },
  { label: 'Sympathy', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDxqxZl5uLWdPdRLE9uahvEchSPiN4SXWnByXt_vbkuXIbCCveP2P2rfyPCCNPhgdcUKwyEhWmmkS43PuKtF_Q7EziyUgxL8YDlv2NeY2_ChcfUwMI1nM11ooD9cnNao-DofJS4bQZg_8xGwb6dLqGJj80GZSlv1XsgWS_zQDX4Hz5FNhOuRWogN9RdlKOijkpPgw6JbZFEsJiPLJBgW-ak2HMmr7lVeTaaIITLh_P0pUE0_PEKsqb2tw', aspect: 'aspect-square', offset: 'md:ml-12' },
  { label: 'Birthdays', image: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=600&q=80&auto=format&fit=crop', aspect: 'aspect-square', offset: 'md:mr-12' },
  { label: 'Just Because', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuASJkJVcDGq2xJ-m_75JshUMNd5o3sjg8h4EM8f23N2pEFqI37zreODcaePB_HaKf2sPfOQb03m91VM_U3yRwvc0jTg4Mu26o-v-6V2lqGOoAv-cZ2wJ3LMh16-JGnLX4Yfr1VMIU7M3fXgYZa0IWRPf1MWhGK1vcPb2vm1BO2bAb-MfT-pHYLyDjaBHgJAmxCtaK60OENtm9WRTuuwvCwBJTgTYYJeDb911OtIhVP-yYNfMswsIALLSQ', aspect: 'aspect-[4/5]', offset: '' },
];

export default async function HomePage({ params }: HomePageParams) {
  const { locale: localeSegment, city: cityCode } = await params;
  const { locale, t } = await getServerT(localeSegment);
  const city = getCityBySlug(cityCode);
  const cityName = city ? pickLocalized(locale, { en: city.name, ar: city.nameAr, fr: city.nameFr }) : undefined;
  const titleWords = t('homeTitle').split(' ');
  const inlineAt = Math.min(3, Math.max(1, titleWords.length - 2));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader cityName={cityName} />
      <main className="flex-grow">
        {/* Hero */}
        <section className="mx-auto max-w-[1280px] px-5 md:px-[64px] pt-12 md:pt-24 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-5 order-2 lg:order-1 pt-8 lg:pt-0 lg:pl-8">
              <span className="uppercase tracking-widest text-xs font-medium text-tertiary mb-6 block">{t('homeEyebrow')}</span>
              <h1 className="font-display text-[42px] lg:text-[64px] font-semibold leading-[1.1] tracking-[-0.02em] text-on-surface mb-8">
                {titleWords.slice(0, inlineAt + 1).join(' ')}{' '}
                <span className="inline-block align-middle mx-2 w-16 h-12 md:w-24 md:h-16 rounded-full overflow-hidden border border-outline-variant/50">
                  <span className="block h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${HERO_INLINE_IMAGE})` }} aria-hidden="true" />
                </span>{' '}
                {titleWords.slice(inlineAt + 1).join(' ')}
              </h1>
              <p className="text-[18px] leading-[1.6] text-on-surface-variant mb-10 max-w-md">{t('homeLede')}</p>
              <Link href={`/${locale}/${cityCode}/shop`} className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-medium text-on-primary transition-colors hover:bg-on-primary-fixed-variant active:scale-95">
                {t('explore')} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="lg:col-span-7 order-1 lg:order-2 flex justify-end">
              <div className="relative w-full md:w-4/5 lg:w-full aspect-[4/5] overflow-hidden rounded-lg border border-outline-variant/30 bg-surface-container-low p-2 md:p-4 glow-shadow">
                <div className="h-full w-full overflow-hidden rounded bg-cover bg-center" style={{ backgroundImage: `url(${HERO_IMAGE_URL})` }} aria-label="A warm bouquet of fresh flowers" />
              </div>
            </div>
          </div>
        </section>

        {/* Featured gestures */}
        <section className="border-y border-outline-variant/20 bg-surface-container-low py-16">
          <div className="mx-auto flex max-w-[1280px] items-end justify-between px-5 md:px-[64px] mb-8">
            <h2 className="font-display text-2xl font-medium text-on-surface">Featured gestures</h2>
          </div>
          <div className="hide-scrollbar w-full overflow-x-auto pb-8">
            <div className="flex w-max gap-6 px-5 md:px-[64px]">
              {FEATURED.map((card) => (
                <Link key={card.name} href={`/${locale}/${cityCode}/shop`} className="group w-[280px] md:w-[320px] cursor-pointer">
                  <div className="relative mb-4 aspect-[3/4] overflow-hidden rounded-lg border border-outline-variant/30 bg-surface">
                    {card.badge ? <span className={`absolute left-3 top-3 z-10 rounded-full px-3 py-1 text-xs font-medium ${card.tone}`}>{card.badge}</span> : null}
                    <span className="block h-full w-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: `url(${card.image})` }} />
                  </div>
                  <div className="flex items-start justify-between">
                    <h3 className="font-display text-lg text-on-surface">{card.name}</h3>
                    <span className="price text-sm tracking-[0.05em] text-on-surface-variant">{card.price}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Editorial split */}
        <section className="mx-auto max-w-[1280px] px-5 md:px-[64px] py-16 mt-12 mb-24">
          <div className="mb-16 text-center">
            <h2 className="font-display text-[32px] font-medium leading-[1.2] text-on-surface mb-4">
              {t('editorialTitle')}
            </h2>
            <div className="mx-auto h-px w-12 bg-outline-variant" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-16 items-start">
            <div className="flex flex-col gap-12 pt-0 md:pt-24">
              {FEELINGS.slice(0, 2).map((feeling) => (
                <Link key={feeling.label} href={`/${locale}/${cityCode}/shop`} className={`group relative block overflow-hidden rounded-lg border border-outline-variant/20 bg-surface p-2 glow-shadow ${feeling.offset}`}>
                  <div className={`${feeling.aspect} overflow-hidden rounded`}>
                    <span className="block h-full w-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: `url(${feeling.image})` }} />
                  </div>
                  <span className="absolute bottom-6 left-6 right-6 flex items-center justify-between rounded border border-outline-variant/30 bg-surface/90 p-4 backdrop-blur-sm">
                    <span className="font-display text-xl text-on-surface">{feeling.label}</span>
                    <ArrowRight className="h-5 w-5 text-primary transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-12 pt-12 md:pt-0">
              {FEELINGS.slice(2, 4).map((feeling) => (
                <Link key={feeling.label} href={`/${locale}/${cityCode}/shop`} className={`group relative block overflow-hidden rounded-lg border border-outline-variant/20 bg-surface p-2 glow-shadow ${feeling.offset}`}>
                  <div className={`${feeling.aspect} overflow-hidden rounded`}>
                    <span className="block h-full w-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: `url(${feeling.image})` }} />
                  </div>
                  <span className="absolute bottom-6 left-6 right-6 flex items-center justify-between rounded border border-outline-variant/30 bg-surface/90 p-4 backdrop-blur-sm">
                    <span className="font-display text-xl text-on-surface">{feeling.label}</span>
                    <ArrowRight className="h-5 w-5 text-primary transition-transform group-hover:translate-x-1" />
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
