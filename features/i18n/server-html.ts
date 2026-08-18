export type HtmlAttributes = {
  lang: string;
  dir: 'ltr' | 'rtl';
  themeClass: string;
};

/**
 * Derive the server-rendered <html> attributes from the resolved locale and
 * the theme cookie so the initial HTML matches the request (no wrong
 * direction/theme flash, SEO-correct lang). Falls back to en/ltr/light.
 */
export function resolveHtmlAttributes(
  locale: string | undefined,
  themeCookie: string | undefined,
): HtmlAttributes {
  const lang = locale === 'ar' || locale === 'fr' ? locale : 'en';
  return {
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    themeClass: themeCookie === 'dark' ? ' dark' : '',
  };
}
