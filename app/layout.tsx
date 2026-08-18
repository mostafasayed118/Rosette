import { Cairo, Fraunces, Inter } from 'next/font/google';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { CartProvider } from '@/features/cart/CartProvider';
import { I18nProvider } from '@/features/i18n/I18nProvider';
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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en" suppressHydrationWarning className={`${fraunces.variable} ${inter.variable} ${cairo.variable}`}><body><ThemeProvider><I18nProvider><CartProvider>{children}</CartProvider><ChatWidget whatsappNumber={getOptionalServerEnv('WHATSAPP_BUSINESS_NUMBER')} /></I18nProvider></ThemeProvider></body></html>;
}
