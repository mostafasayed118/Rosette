import { getServerT } from '@/features/i18n/server';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ErrorShell } from '@/components/error/ErrorShell';

export default async function LocaleUnauthorized() {
  const { locale, t } = await getServerT();
  return (
    <ErrorShell
      status={401}
      eyebrow={t('unauthorizedEyebrow')}
      title={t('unauthorizedTitle')}
      lede={t('unauthorizedLede')}
    >
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link href={`/${locale}/login`}>{t('unauthorizedSignIn')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/${locale}`}>{t('unauthorizedHome')}</Link>
        </Button>
      </div>
    </ErrorShell>
  );
}
