'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { categories, occasions } from './data';
import { categoryMessageKeys, occasionMessageKeys } from './catalog-labels';
import { parseCatalogQuery, serializeCatalogQuery } from './catalog-utils';

export function CatalogToolbar() {
  const { t } = useI18n();
  const { href } = useStorePath();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = parseCatalogQuery(new URLSearchParams(searchParams.toString()));
  function update(key: 'search' | 'category' | 'occasion' | 'sort', value: string) {
    // Any filter or sort change invalidates the current page, so reset to page 1.
    const next = { ...query, [key]: value || undefined, page: undefined };
    const serialized = serializeCatalogQuery(next);
    router.push(`${pathname}${serialized ? `?${serialized}` : ''}`);
  }
  const chip = (active: boolean) => `press rounded-full px-5 py-2 text-sm font-medium whitespace-nowrap transition-all duration-300 ${active ? 'chip-active shadow-[0_4px_14px_-4px_rgb(58_20_30_/_35%)]' : 'chip-inactive hover:bg-outline-variant/25 hover:-translate-y-0.5'}`;
  return (
    <section className="sticky top-[57px] z-30 -mx-[min(calc((100vw-80rem)/2),1.5rem)] border-y border-surface-variant bg-background/90 px-[min(calc((100vw-80rem)/2),1.5rem)] py-4 backdrop-blur-md md:mx-0 md:px-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex w-full items-center overflow-hidden rounded-full bg-surface-container md:w-64">
            <Search className="pointer-events-none absolute left-4 h-4 w-4 text-on-surface-variant" />
            <Input value={query.search ?? ''} onChange={(event) => update('search', event.target.value)} placeholder={t('searchPlaceholder')} className="border-none bg-transparent pl-12 pr-4 focus-visible:ring-0" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <button key={category} type="button" onClick={() => update('category', category === 'all' ? '' : category)} className={chip((query.category ?? 'all') === category)}>
                {category === 'all' ? t('all') : t(categoryMessageKeys[category] ?? category)}
              </button>
            ))}
          </div>
          <span className="hidden h-6 w-px bg-outline-variant/50 md:block" aria-hidden="true" />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {occasions.map((occasion) => (
              <button key={occasion} type="button" onClick={() => update('occasion', occasion === 'all' ? '' : occasion)} className={chip((query.occasion ?? 'all') === occasion)}>
                {occasion === 'all' ? t('all') : t(occasionMessageKeys[occasion] ?? occasion)}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-sm text-on-surface-variant md:block">{t('sort')}</span>
          <Select value={query.sort ?? 'recommended'} onValueChange={(value) => update('sort', value)}>
            <SelectTrigger className="w-[200px] border-none bg-transparent font-medium"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recommended">{t('recommended')}</SelectItem>
              <SelectItem value="newest">{t('newest')}</SelectItem>
              <SelectItem value="price-asc">{t('priceAsc')}</SelectItem>
              <SelectItem value="price-desc">{t('priceDesc')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container px-5 py-4">
        <p className="text-sm font-medium text-on-surface">{t('giftFinderShopBanner')}</p>
        <Link href={href('/gift-finder')} className="text-sm font-semibold text-primary underline underline-offset-4 hover:text-on-primary-fixed-variant">{t('giftFinderShopBannerAction')} ↗</Link>
      </div>
    </section>
  );
}
