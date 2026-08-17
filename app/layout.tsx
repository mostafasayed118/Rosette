import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { CartProvider } from '@/features/cart/CartProvider';
import { I18nProvider } from '@/features/i18n/I18nProvider';

export const metadata: Metadata = {
  title: 'Rosette — thoughtful flowers, delivered',
  description: 'An original botanical gift storefront concept.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body><I18nProvider><CartProvider>{children}</CartProvider></I18nProvider></body></html>;
}
