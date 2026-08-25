'use client';

import Link from 'next/link';
import { useI18n } from './I18nProvider';

type LocalizedPageHeadingProps = { eyebrow: string; title: string; lede: string; action?: string; actionHref?: string; values?: Record<string, string | number> };
export function LocalizedPageHeading({ eyebrow, title, lede, action, actionHref, values }: LocalizedPageHeadingProps) {
  const { t } = useI18n();
  return <div className="flex items-end justify-between gap-8 border-b py-8 pb-12 max-md:flex-col max-md:items-start"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t(eyebrow, values)}</p><h1 className="mt-2 mb-4 max-w-[12ch] font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95] tracking-[-.02em]">{t(title)}</h1><p className="max-w-[42rem] text-[1.1rem] text-muted-foreground">{t(lede)}</p></div>{action ? actionHref ? <Link className="text-sm text-primary underline underline-offset-4" href={actionHref}>{t(action)} ↗</Link> : <span className="text-sm text-primary underline underline-offset-4">{t(action)} ↗</span> : null}</div>;
}
