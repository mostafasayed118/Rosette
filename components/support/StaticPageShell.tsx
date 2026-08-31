import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';

export function StaticPageShell({ locale, city, eyebrow, title, lede, children }: {
  locale: string;
  city: string;
  eyebrow: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main id="main-content" className="mx-auto w-[min(calc(100%-3rem),80rem)] flex-1 py-16 md:py-24">
        <article className="max-w-2xl">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-sage">{eyebrow}</span>
          <h1 className="mt-3 font-display text-[clamp(2.5rem,6vw,4rem)] font-medium leading-[1.05] tracking-[-0.02em] text-on-surface">{title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-on-surface-variant">{lede}</p>
          <div className="mt-8 border-t border-outline-variant/30 pt-8 text-[1.05rem] leading-[1.8] text-on-surface-variant">{children}</div>
        </article>
      </main>
      <SiteFooter locale={locale} city={city} />
    </div>
  );
}
