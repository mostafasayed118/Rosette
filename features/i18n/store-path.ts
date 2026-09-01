/**
 * Storefront path builder shared by server and client renderers.
 *
 * `useStorePath()` derives `basePath` from the router params on the client;
 * server components derive it from the `params` promise. Both funnel into this
 * helper so a `/{locale}/{city}` prefix is prepended exactly once.
 */
export function storeHref(basePath: string, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${basePath}${normalized}`;
}

/** Build the `/{locale}/{city}` prefix used by {@link storeHref}. */
export function storeBasePath(locale: string, city?: string): string {
  const trimmedLocale = locale.replace(/[^a-z-]/gi, '').toLowerCase() || 'en';
  const trimmedCity = (city ?? '').replace(/^\/+|\/+$/g, '');
  const isValidCity = /^[a-z0-9-]+$/i.test(trimmedCity);
  const safeCity = trimmedCity && isValidCity ? trimmedCity.toLowerCase() : '';
  return safeCity ? `/${trimmedLocale}/${safeCity}` : `/${trimmedLocale}`;
}
