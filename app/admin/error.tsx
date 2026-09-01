'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/features/i18n/I18nProvider';
import { translate } from '@/features/i18n/translate';

function useSafeT(): (key: string) => string {
  try {
    return useI18n().t;
  } catch {
    return (key: string) => translate('en', key);
  }
}

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useSafeT();
  return (
    <div className="grid min-h-[60vh] place-content-center p-8" role="alert">
      <Card className="w-full max-w-lg p-6">
        <div className="grid gap-3">
          <h1 className="font-display text-2xl font-medium text-primary">{t('panelCouldNotLoad')}</h1>
          <p className="text-sm text-muted-foreground">{t('requestFailed')}</p>
          {error.message ? (
            <details className="rounded-md border bg-muted/30 p-3 text-xs">
              <summary className="cursor-pointer font-medium">{t('errorDetails')}</summary>
              <p className="mt-2 break-all font-mono text-muted-foreground">{error.message}</p>
            </details>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="default" size="lg" onClick={reset}>
              {t('tryAgain')}
            </Button>
            <Button variant="outline" size="lg" onClick={() => (window.location.href = '/admin')}>
              {t('backToDashboard')}
            </Button>
          </div>
          {error.digest ? <p className="text-xs text-muted-foreground/70">{t('errorRefLabel')} {error.digest}</p> : null}
        </div>
      </Card>
    </div>
  );
}
