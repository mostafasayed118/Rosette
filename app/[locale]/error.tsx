'use client';

import { useEffect } from 'react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { ErrorShell } from '@/components/error/ErrorShell';

interface LocaleErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LocaleError({ error, reset }: LocaleErrorProps) {
  const { locale, t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorShell
      status={500}
      eyebrow={t('errorEyebrow')}
      title={t('errorTitle')}
      lede={t('errorLede')}
      action={{ label: t('errorRetry'), onRetry: reset }}
      secondaryAction={{ label: t('errorHome'), href: `/${locale}` }}
      digest={error.digest}
      digestLabel={t('errorRefLabel')}
    />
  );
}
