'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/features/i18n/I18nProvider';
import { NOTIFICATION_TYPE_LABEL_KEYS } from '@/features/admin/notification-type-labels';

export function NotificationsToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [type, setType] = useState(searchParams.get('type') ?? '');

  function submit() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    router.push(`${pathname}${params.toString() ? `?${params}` : ''}`);
  }

  return <div className="my-4 grid grid-cols-[minmax(14rem,2fr)_repeat(2,1fr)_auto] items-end gap-3 max-md:grid-cols-1">
    <div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('adminSearch')}</span><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('notificationSearchPlaceholder')} /></div>
    <div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('statusFilter')}</span><Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem><SelectItem value="failed">{t('statusFailed')}</SelectItem><SelectItem value="pending">{t('statusPending')}</SelectItem></SelectContent></Select></div>
    <div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('emailType')}</span><Select value={type || 'all'} onValueChange={(v) => setType(v === 'all' ? '' : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{Object.entries(NOTIFICATION_TYPE_LABEL_KEYS).map(([value, labelKey]) => <SelectItem key={value} value={value}>{t(labelKey)}</SelectItem>)}</SelectContent></Select></div>
    <Button type="button" onClick={submit}>{t('filter')}</Button>
  </div>;
}
