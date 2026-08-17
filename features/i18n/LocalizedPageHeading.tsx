'use client';

import Link from 'next/link';
import { useI18n } from './I18nProvider';

type LocalizedPageHeadingProps = { eyebrow: string; title: string; lede: string; action?: string; actionHref?: string };
export function LocalizedPageHeading({ eyebrow, title, lede, action, actionHref }: LocalizedPageHeadingProps) { const { t } = useI18n(); return <div className="page-heading"><div><p className="eyebrow">{t(eyebrow)}</p><h1>{t(title)}</h1><p className="lede">{t(lede)}</p></div>{action ? actionHref ? <Link className="text-button" href={actionHref}>{t(action)} ↗</Link> : <span className="text-button">{t(action)} ↗</span> : null}</div>; }
