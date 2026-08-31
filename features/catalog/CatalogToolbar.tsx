'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { categories, occasions } from './data';
import { GIFT_COLORS } from '@/features/gift-finder/tags';
import { categoryMessageKeys, colorMessageKeys, occasionMessageKeys } from './catalog-labels';
import { parseCatalogQuery, serializeCatalogQuery } from './catalog-utils';

export function CatalogToolbar({ availableCategories = categories }: { availableCategories?: string[] }) {
  const { t } = useI18n();
  const categoryOptions = availableCategories.includes('all') ? availableCategories : ['all', ...availableCategories];
  const { href } = useStorePath();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = parseCatalogQuery(new URLSearchParams(searchParams.toString()));
  function update(key: 'search' | 'category' | 'occasion' | 'color' | 'sort', value: string) {
    // Any filter or sort change invalidates the current page, so reset to page 1.
    const next = { ...query, [key]: value || undefined, page: undefined };
    const serialized = serializeCatalogQuery(next);
    router.push(`${pathname}${serialized ? `?${serialized}` : ''}`);
  }
  const chip = (active: boolean) => `press rounded-full px-5 py-2 text-sm font-medium whitespace-nowrap transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'chip-active shadow-[0_4px_14px_-4px_rgb(58_20_30_/_35%)]' : 'chip-inactive hover:bg-outline-variant/25 hover:-translate-y-0.5'}`;
  return (
    // The old full-bleed offset used min(calc((100vw-80rem)/2), 1.5rem), which
    // goes negative below 1280px and flipped into a huge positive margin —
    // pushing the bar ~460px off-screen on phones. Bleed by the real gutter.
    <section className="sticky top-[var(--site-header-height)] z-30 -mx-4 border-y border-surface-variant bg-background/90 px-4 py-4 backdrop-blur-md md:mx-0 md:px-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <div className="relative flex w-full min-w-0 items-center overflow-hidden rounded-full bg-surface-container md:w-64">
            <Search className="pointer-events-none absolute left-4 h-4 w-4 text-on-surface-variant" />
            <Input aria-label={t('search')} value={query.search ?? ''} onChange={(event) => update('search', event.target.value)} placeholder={t('searchPlaceholder')} className="border-none bg-transparent pl-12 pr-4 focus-visible:ring-0" />
          </div>
          <div className="flex gap-2 md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <button type="button" className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-outline-variant bg-surface-container px-4 text-sm font-medium text-on-surface">
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  {t('filter')}
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[80vh] rounded-t-3xl px-5 pb-8">
                <SheetHeader><SheetTitle>{t('filter')}</SheetTitle></SheetHeader>
                <div className="grid gap-6 overflow-y-auto pt-2">
                  <fieldset className="grid gap-3">
                    <legend className="text-sm font-semibold text-on-surface">{t('category')}</legend>
                    <div className="flex flex-wrap gap-2">
                      {categoryOptions.map((category) => (
                        <SheetClose asChild key={category}>
                          <button type="button" onClick={() => update('category', category === 'all' ? '' : category)} className={chip((query.category ?? 'all') === category)}>
                            {category === 'all' ? t('all') : t(categoryMessageKeys[category] ?? category)}
                          </button>
                        </SheetClose>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="grid gap-3">
                    <legend className="text-sm font-semibold text-on-surface">{t('occasion')}</legend>
                    <div className="flex flex-wrap gap-2">
                      {occasions.map((occasion) => (
                        <SheetClose asChild key={occasion}>
                          <button type="button" onClick={() => update('occasion', occasion === 'all' ? '' : occasion)} className={chip((query.occasion ?? 'all') === occasion)}>
                            {occasion === 'all' ? t('all') : t(occasionMessageKeys[occasion] ?? occasion)}
                          </button>
                        </SheetClose>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="grid gap-3">
                    <legend className="text-sm font-semibold text-on-surface">{t('giftColorsLabel')}</legend>
                    <div className="flex flex-wrap gap-2">
                      <SheetClose asChild><button type="button" onClick={() => update('color', '')} className={chip(!query.color)}>{t('all')}</button></SheetClose>
                      {GIFT_COLORS.map((color) => (
                        <SheetClose asChild key={color}>
                          <button type="button" onClick={() => update('color', color)} className={chip(query.color === color)}>{t(colorMessageKeys[color] ?? color)}</button>
                        </SheetClose>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <div className="relative hidden gap-2 overflow-x-auto pb-1 md:flex">
            {categoryOptions.map((category) => (
              <button key={category} type="button" onClick={() => update('category', category === 'all' ? '' : category)} className={chip((query.category ?? 'all') === category)}>
                {category === 'all' ? t('all') : t(categoryMessageKeys[category] ?? category)}
              </button>
            ))}
          </div>
          <span className="hidden h-6 w-px bg-outline-variant/50 md:block" aria-hidden="true" />
          <div className="relative hidden gap-2 overflow-x-auto pb-1 md:flex">
            {occasions.map((occasion) => (
              <button key={occasion} type="button" onClick={() => update('occasion', occasion === 'all' ? '' : occasion)} className={chip((query.occasion ?? 'all') === occasion)}>
                {occasion === 'all' ? t('all') : t(occasionMessageKeys[occasion] ?? occasion)}
              </button>
            ))}
          </div>
          <span className="hidden h-6 w-px bg-outline-variant/50 md:block" aria-hidden="true" />
          <div className="relative hidden gap-2 overflow-x-auto pb-1 md:flex">
            <button type="button" onClick={() => update('color', '')} className={chip(!query.color)}>{t('all')}</button>
            {GIFT_COLORS.map((color) => (
              <button key={color} type="button" onClick={() => update('color', color)} className={chip(query.color === color)}>{t(colorMessageKeys[color] ?? color)}</button>
            ))}
          </div>
        </div>
        <div className="ml-auto flex w-full items-center gap-2 md:w-auto">
          <span className="hidden text-sm text-on-surface-variant md:block">{t('sort')}</span>
          <Select value={query.sort ?? 'recommended'} onValueChange={(value) => update('sort', value)}>
            <SelectTrigger className="w-full border-none bg-transparent font-medium md:w-[200px]"><SelectValue /></SelectTrigger>
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
