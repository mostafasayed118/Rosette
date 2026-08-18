import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getServerT } from '@/features/i18n/server';

export default async function NotFound() {
  const { t } = await getServerT();
  return <main className="mx-auto grid min-h-[70vh] w-[min(calc(100%-3rem),80rem)] place-content-center justify-items-start"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('notFoundEyebrow')}</p><h1 className="mt-2 mb-6 max-w-[12ch] font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95]">{t('notFoundTitle')}</h1><p className="text-muted-foreground">{t('notFoundLede')}</p><Button asChild className="mt-6"><Link href="/en">{t('notFoundAction')} <span aria-hidden="true">↗</span></Link></Button></main>;
}
