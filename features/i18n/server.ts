import { cookies } from 'next/headers';
import { messages } from './dictionaries';
import type { Locale } from './types';

export async function getServerT() {
  const store = await cookies();
  const saved = store.get('rosette.locale')?.value;
  const locale: Locale = saved === 'ar' || saved === 'fr' ? saved : 'en';
  const t = (key: string, values?: Record<string, string | number>) => {
    let text = messages[locale][key] ?? messages.en[key] ?? key;
    for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
  return { locale, t };
}
