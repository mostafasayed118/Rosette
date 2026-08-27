import { getServerT } from '@/features/i18n/server';
import { ErrorShell } from '@/components/error/ErrorShell';

export default async function LocaleNotFound() {
  const { locale, t } = await getServerT();
  return (
    <ErrorShell
      status={404}
      eyebrow={t('notFoundEyebrow')}
      title={t('notFoundTitle')}
      lede={t('notFoundLede')}
      action={{ label: t('notFoundAction'), href: `/${locale}` }}
    />
  );
}
