import { Fraunces, IBM_Plex_Sans_Arabic, JetBrains_Mono, Outfit } from 'next/font/google';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { CartProvider } from '@/features/cart/CartProvider';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { messages } from '@/features/i18n/dictionaries';
import { getServerT } from '@/features/i18n/server';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { ChatWidgetLazy } from '@/components/support/ChatWidgetLazy';
import { CloudflareWebAnalytics } from '@/components/analytics/CloudflareWebAnalytics';
import { ReduceMotionProvider } from './reduce-motion-provider';
import { Toaster } from '@/components/ui/sonner';
import { getOptionalServerEnv } from '@/lib/server-env';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600', '700'], variable: '--font-arabic', display: 'swap' });

const siteUrl = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const siteTitle = 'Rosette — thoughtful flowers, delivered';
const siteDescription = 'Thoughtful botanical gifts and flowers, delivered with care.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: '%s | Rosette',
  },
  description: siteDescription,
  applicationName: 'Rosette',
  authors: [{ name: 'Rosette Atelier' }],
  creator: 'Rosette Atelier',
  publisher: 'Rosette Atelier',
  openGraph: {
    type: 'website',
    siteName: 'Rosette',
    title: siteTitle,
    description: siteDescription,
    images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: siteTitle }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: ['/og-image.svg'],
  },
};

// Cloudflare has no middleware, so sync theme, <html lang/dir>, and the locale
// cookie before first paint. The root layout deliberately reads no cookies:
// doing so would opt all ~57 routes into dynamic rendering and drop ISR.
const THEME_SYNC_SCRIPT = `
(function () {
  try {
    var stored = null;
    try { stored = window.localStorage.getItem('rosette.theme.v1'); } catch (e) {}
    var cookie = document.cookie.split('; ').find(function (part) { return part.indexOf('rosette.theme=') === 0; });
    var cookieTheme = cookie ? cookie.split('=')[1] : null;
    var systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'dark' || stored === 'light' ? stored : cookieTheme === 'dark' || cookieTheme === 'light' ? cookieTheme : systemDark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();
`;

// Locale-aware <html lang/dir> plus the skip-link label. Prefixed routes
// (/en, /ar, /fr) win; non-prefixed routes (/admin, /login) fall back to the
// locale cookie, which is what the server used to render.
const LOCALE_SYNC_SCRIPT = `
(function () {
  try {
    var labels = ${JSON.stringify({ en: messages.en.skipToContent, ar: messages.ar.skipToContent, fr: messages.fr.skipToContent })};
    var seg = window.location.pathname.split('/').filter(Boolean)[0];
    var cookie = document.cookie.split('; ').find(function (part) { return part.indexOf('rosette.locale=') === 0; });
    var cookieLocale = cookie ? cookie.split('=')[1] : null;
    var known = function (value) { return value === 'en' || value === 'ar' || value === 'fr' ? value : null; };
    var locale = known(seg) || known(cookieLocale);
    if (!locale) return;
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.setAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    var link = document.getElementById('skip-to-content');
    if (link && labels[locale]) link.textContent = labels[locale];
    if (locale === seg) document.cookie = 'rosette.locale=' + locale + '; path=/; max-age=31536000; samesite=lax';
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // English is only the no-JS/pre-hydration fallback: LOCALE_SYNC_SCRIPT sets
  // lang/dir and the skip-link label before paint, and I18nProvider re-resolves
  // the locale from the pathname on mount.
  const { t } = await getServerT('en');
  return <html lang="en" dir="ltr" suppressHydrationWarning className={`${fraunces.variable} ${outfit.variable} ${jetbrains.variable} ${plexArabic.variable}`}><head><script dangerouslySetInnerHTML={{ __html: THEME_SYNC_SCRIPT }} /></head><body><a id="skip-to-content" href="#main-content" suppressHydrationWarning className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-on-primary">{t('skipToContent')}</a><script dangerouslySetInnerHTML={{ __html: LOCALE_SYNC_SCRIPT }} /><ReduceMotionProvider><ThemeProvider><I18nProvider><CartProvider><WishlistProvider>{children}</WishlistProvider></CartProvider><ChatWidgetLazy whatsappNumber={getOptionalServerEnv('WHATSAPP_BUSINESS_NUMBER')} /><CloudflareWebAnalytics token={getOptionalServerEnv('NEXT_PUBLIC_CF_BEACON_TOKEN')} enabled={process.env.NODE_ENV === 'production'} /></I18nProvider><Toaster position="top-center" /></ThemeProvider></ReduceMotionProvider></body></html>;
}
