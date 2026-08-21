import { messages } from './dictionaries';
import { resolveServerLocale } from './server-locale';
import type { Locale } from './types';

export async function getServerT(locale?: string) {
  const value = locale ?? (await resolveServerLocale());
  const resolved: Locale = value === 'ar' || value === 'fr' ? value : 'en';
  const t = (key: string, values?: Record<string, string | number>) => {
    let text = messages[resolved][key] ?? messages.en[key] ?? key;
    for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
  return { locale: resolved, t };
}
