import { Cairo, Fraunces, Inter } from 'next/font/google';
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
import { getOptionalServerEnv } from '@/lib/server-env';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const cairo = Cairo({ subsets: ['arabic'], variable: '--font-arabic', display: 'swap' });

export const metadata: Metadata = {
  title: 'Rosette — thoughtful flowers, delivered',
  description: 'An original botanical gift storefront concept.',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const store = await cookies();
  const locale = await resolveServerLocale();
  const attrs = resolveHtmlAttributes(locale, store.get('rosette.theme')?.value);
  return <html lang={attrs.lang} dir={attrs.dir} suppressHydrationWarning className={`${fraunces.variable} ${inter.variable} ${cairo.variable}${attrs.themeClass}`}><body><ThemeProvider><I18nProvider><CartProvider><WishlistProvider>{children}</WishlistProvider></CartProvider><ChatWidget whatsappNumber={getOptionalServerEnv('WHATSAPP_BUSINESS_NUMBER')} /></I18nProvider></ThemeProvider></body></html>;
}
