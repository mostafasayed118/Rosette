'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import type { OrderStatus } from './types';
const steps: Array<{ status: OrderStatus; key: string }> = [{ status: 'confirmed', key: 'orderConfirmed' }, { status: 'preparing', key: 'preparing' }, { status: 'out_for_delivery', key: 'outForDelivery' }, { status: 'delivered', key: 'delivered' }];
const rank: Record<OrderStatus, number> = { draft: 0, pending_payment: 0, confirmed: 1, preparing: 2, out_for_delivery: 3, delivered: 4, cancelled: -1, failed: -1 };
export function OrderTimeline({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  return <ol className="my-8 grid list-none gap-0 p-0">{steps.map((step) => <li className={`flex min-h-12 items-center gap-3 ${rank[status] >= rank[step.status] ? 'font-bold text-primary' : 'text-muted-foreground'}`} key={step.status}><span className={`h-3.5 w-3.5 rounded-full border-2 ${rank[status] >= rank[step.status] ? 'border-primary bg-primary' : 'border-border bg-background'}`} aria-hidden="true" /><span>{t(step.key)}</span></li>)}</ol>;
}
