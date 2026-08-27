import { getServerT } from '@/features/i18n/server';
import { ErrorShell } from '@/components/error/ErrorShell';

export default async function LocaleForbidden() {
  const { locale, t } = await getServerT();
  return (
    <ErrorShell
      status={403}
      eyebrow={t('forbiddenEyebrow')}
      title={t('forbiddenTitle')}
      lede={t('forbiddenLede')}
      action={{ label: t('forbiddenHome'), href: `/${locale}` }}
    />
  );
}
