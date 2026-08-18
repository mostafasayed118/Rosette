import type { Metadata } from 'next';
import type { Product } from '@/features/catalog/types';
import { pickLocalized } from '@/features/i18n/pick';
import { LOCALES } from '@/lib/locale-routing';
import type { Locale } from '@/features/i18n/types';

export function buildProductMetadata(args: {
  product: Product;
  locale: Locale;
  city: string;
  base: string;
}): Metadata {
  const { product, locale, city } = args;
  const base = args.base.replace(/\/$/, '');
  const name = pickLocalized(locale, { en: product.name, ar: product.nameAr, fr: product.nameFr });
  const description = pickLocalized(locale, { en: product.description, ar: product.descriptionAr, fr: product.descriptionFr });
  const canonical = `${base}/${locale}/${city}/shop/${product.slug}`;
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = `${base}/${l}/${city}/shop/${product.slug}`;
  return {
    title: name,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title: name,
      description,
      url: canonical,
      images: product.imageUrl ? [{ url: product.imageUrl }] : undefined,
      type: 'website',
    },
  };
}
