import Link from 'next/link';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';

export function GiftCardCheckoutResult({ status }: { status: 'pending' | 'paid' | 'failed' }) {
  const { t } = useI18n();
  if (status === 'paid') return <StatusMessage title={t('giftCardPaid')}>{t('giftCardDeliveryHint')}</StatusMessage>;
  if (status === 'failed') return <StatusMessage title={t('giftCardPaymentFailed')} tone="error" />;
  return <><StatusMessage title={t('giftCardPaymentPending')}>{t('giftCardDeliveryPending')}</StatusMessage><Link className="text-sm text-primary underline" href="/">{t('keepBrowsing')}</Link></>;
}
