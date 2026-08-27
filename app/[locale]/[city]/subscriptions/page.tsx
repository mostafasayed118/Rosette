import Link from 'next/link';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { getActivePlans } from '@/features/subscriptions/repository';
import { formatMoney } from '@/features/money';
import type { Locale } from '@/features/i18n/types';

type PageParams = { params: Promise<{ locale: string; city: string }> };

export default async function SubscriptionsLandingPage({ params }: PageParams) {
  const { locale, city } = await params;
  const { t } = await getServerT(locale);
  const plans = await getActivePlans(getAdminSupabase());

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-grow w-full max-w-[1280px] mx-auto px-5 md:px-16 py-10 md:py-16">
        <section className="grid gap-4 border-b border-outline-variant/25 pb-10 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sage">{t('subscriptionsLede')}</p>
          <h1 className="font-display text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-primary">
            {t('subscriptionsTitle')}
          </h1>
        </section>
        <section className="grid gap-6 pt-10 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.id} className="flex flex-col gap-4 rounded-2xl border border-outline-variant/25 bg-surface-container-low p-6">
              <div className="grid gap-1">
                <h2 className="font-display text-[1.5rem] font-semibold text-primary">{locale === 'ar' ? plan.nameAr || plan.nameEn : locale === 'fr' ? plan.nameFr || plan.nameEn : plan.nameEn}</h2>
                <p className="text-sm leading-relaxed text-on-surface-variant">{locale === 'ar' ? plan.descriptionAr : locale === 'fr' ? plan.descriptionFr : plan.descriptionEn}</p>
              </div>
              <ul className="grid gap-1.5 text-sm text-on-surface-variant">
                {plan.bundlePrices.map((bp) => (
                  <li key={bp.deliveries}>{bp.deliveries} × {t('subscriptionProgress')} · {formatMoney(bp.priceMinor, locale as Locale)}</li>
                ))}
              </ul>
              <Link
                className="mt-auto inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-on-primary transition-colors hover:bg-primary/90"
                href={`/${locale}/${city}/subscriptions/${plan.slug}/checkout`}
              >
                {t('subscriptionManage')}
              </Link>
            </article>
          ))}
        </section>
      </main>
      <SiteFooter locale={locale} city={city} />
    </div>
  );
}
