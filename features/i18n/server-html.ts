export type HtmlAttributes = {
  lang: string;
  dir: 'ltr' | 'rtl';
  themeClass: string;
};

/**
 * Derive the server-rendered <html> attributes from the locale/theme cookies
 * so the initial HTML matches the client's persisted preferences (no wrong
 * direction/theme flash, SEO-correct lang). Falls back to en/ltr/light.
 */
export function resolveHtmlAttributes(
  localeCookie: string | undefined,
  themeCookie: string | undefined,
): HtmlAttributes {
  const lang = localeCookie === 'ar' ? 'ar' : 'en';
  return {
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    themeClass: themeCookie === 'dark' ? ' dark' : '',
  };
}
