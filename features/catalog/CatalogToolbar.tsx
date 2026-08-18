'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  return (
    <div className="grid grid-cols-[minmax(14rem,2fr)_repeat(3,1fr)] gap-4 py-6 max-md:grid-cols-2">
      <div className="grid gap-2 max-md:col-span-2">
        <Label>{t('search')}</Label>
        <Input value={query.search ?? ''} onChange={(event) => update('search', event.target.value)} placeholder={t('searchPlaceholder')} className="rounded-full" />
      </div>
      <div className="grid gap-2">
        <Label>{t('category')}</Label>
        <Select value={query.category ?? 'all'} onValueChange={(value) => update('category', value)}>
          <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>{categories.map((category) => <SelectItem key={category} value={category}>{category === 'all' ? t('all') : t(categoryMessageKeys[category] ?? category)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>{t('occasion')}</Label>
        <Select value={query.occasion ?? 'all'} onValueChange={(value) => update('occasion', value)}>
          <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>{occasions.map((occasion) => <SelectItem key={occasion} value={occasion}>{occasion === 'all' ? t('all') : t(occasionMessageKeys[occasion] ?? occasion)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>{t('sort')}</Label>
        <Select value={query.sort ?? 'recommended'} onValueChange={(value) => update('sort', value)}>
          <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recommended">{t('recommended')}</SelectItem>
            <SelectItem value="newest">{t('newest')}</SelectItem>
            <SelectItem value="price-asc">{t('priceAsc')}</SelectItem>
            <SelectItem value="price-desc">{t('priceDesc')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
