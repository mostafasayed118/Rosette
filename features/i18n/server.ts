import { messages } from './dictionaries';
import { resolveServerLocale } from './server-locale';

export async function getServerT() {
  const locale = await resolveServerLocale();
  const t = (key: string, values?: Record<string, string | number>) => {
    let text = messages[locale][key] ?? messages.en[key] ?? key;
    for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
  return { locale, t };
}
