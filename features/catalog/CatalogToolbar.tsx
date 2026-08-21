'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/features/i18n/I18nProvider';
import { categories, occasions } from './data';
import { categoryMessageKeys, occasionMessageKeys } from './catalog-labels';
import { parseCatalogQuery, serializeCatalogQuery } from './catalog-utils';

export function CatalogToolbar() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = parseCatalogQuery(new URLSearchParams(searchParams.toString()));
  function update(key: 'search' | 'category' | 'occasion' | 'sort', value: string) {
    const next = { ...query, [key]: value || undefined };
    const serialized = serializeCatalogQuery(next);
    router.push(`${pathname}${serialized ? `?${serialized}` : ''}`);
  }
  const chip = (active: boolean) => `rounded-full px-5 py-2 text-sm whitespace-nowrap transition-colors ${active ? 'chip-active' : 'chip-inactive hover:bg-outline-variant/20'}`;
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
    </section>
  );
}
