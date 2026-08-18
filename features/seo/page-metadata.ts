import type { Metadata } from 'next';
import { LOCALES } from '@/lib/locale-routing';
import type { Locale } from '@/features/i18n/types';

export function buildLocalizedPageMetadata(args: {
  locale: Locale;
  city: string;
  path: string;
  base: string;
  title?: string;
  description?: string;
}): Metadata {
  const base = args.base.replace(/\/$/, '');
  const canonical = `${base}/${args.locale}/${args.city}${args.path}`;
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = `${base}/${l}/${args.city}${args.path}`;
  return {
    title: args.title,
    description: args.description,
    alternates: { canonical, languages },
  };
}
