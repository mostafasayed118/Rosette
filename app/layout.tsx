import { Fraunces, IBM_Plex_Sans_Arabic, JetBrains_Mono, Outfit } from 'next/font/google';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import './globals.css';
import { CartProvider } from '@/features/cart/CartProvider';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { resolveHtmlAttributes } from '@/features/i18n/server-html';
import { resolveServerLocale } from '@/features/i18n/server-locale';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { ChatWidget } from '@/features/chat/ChatWidget';
import { CloudflareWebAnalytics } from '@/components/analytics/CloudflareWebAnalytics';
import { MotionProvider } from '@/components/motion';
import { Toaster } from '@/components/ui/sonner';
import { getOptionalServerEnv } from '@/lib/server-env';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600', '700'], variable: '--font-arabic', display: 'swap' });

export const metadata: Metadata = {
  title: 'Rosette — thoughtful flowers, delivered',
  description: 'An original botanical gift storefront concept.',
};

// Cloudflare has no middleware, so sync <html lang/dir> and the locale cookie
// from the URL's first segment before first paint. The server still renders a
// cookie-based default so non-prefixed routes (/admin, /login) keep working.
const LOCALE_SYNC_SCRIPT = `
(function () {
  try {
    var seg = window.location.pathname.split('/').filter(Boolean)[0];
    if (seg === 'en' || seg === 'ar' || seg === 'fr') {
      document.documentElement.setAttribute('lang', seg);
      document.documentElement.setAttribute('dir', seg === 'ar' ? 'rtl' : 'ltr');
      document.cookie = 'rosette.locale=' + seg + '; path=/; max-age=31536000; samesite=lax';
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const store = await cookies();
  const locale = await resolveServerLocale();
  const attrs = resolveHtmlAttributes(locale, store.get('rosette.theme')?.value);
  const reduceMotionInitial = store.get('rosette-reduce-motion')?.value === '1';
  return <html lang={attrs.lang} dir={attrs.dir} suppressHydrationWarning className={`${fraunces.variable} ${outfit.variable} ${jetbrains.variable} ${plexArabic.variable}${attrs.themeClass}`}><body><script dangerouslySetInnerHTML={{ __html: LOCALE_SYNC_SCRIPT }} /><MotionProvider initialReduceMotion={reduceMotionInitial}><ThemeProvider><I18nProvider initialLocale={locale}><CartProvider><WishlistProvider>{children}</WishlistProvider></CartProvider><ChatWidget whatsappNumber={getOptionalServerEnv('WHATSAPP_BUSINESS_NUMBER')} /><CloudflareWebAnalytics token={getOptionalServerEnv('NEXT_PUBLIC_CF_BEACON_TOKEN')} /></I18nProvider><Toaster position="top-center" /></ThemeProvider></MotionProvider></body></html>;
}
