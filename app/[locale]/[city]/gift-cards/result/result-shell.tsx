import type { ReactNode } from 'react';
import { LocalizedPageHeading } from '@/features/i18n/LocalizedPageHeading';

export function GiftCardResultShell({ children }: { locale: string; city: string; cityCode: string; children: ReactNode }) {
  return <div className="grid max-w-[54rem] gap-6"><LocalizedPageHeading eyebrow="giftCardsEyebrow" title="giftCardResultTitle" lede="giftCardResultLede" />{children}</div>;
}
