'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';

export function AdminGiftCardActions({ cardId, canVoid }: { cardId: string; canVoid: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  async function action(name: 'void' | 'resend') {
    await fetch('/api/admin/gift-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: name, cardId }) });
    router.refresh();
  }
  return <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => action('resend')}>{t('resendGiftCard')}</Button>{canVoid ? <Button type="button" size="sm" variant="outline" onClick={() => action('void')}>{t('voidGiftCard')}</Button> : null}</div>;
}
