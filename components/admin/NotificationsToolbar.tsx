'use client';

import { useEffect, useState, useTransition } from 'react';
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
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setQ(searchParams.get('q') ?? '');
    setStatus(searchParams.get('status') ?? '');
    setType(searchParams.get('type') ?? '');
  }, [searchParams]);

  function submit() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    startTransition(() => router.push(`${pathname}${params.toString() ? `?${params}` : ''}`));
  }

  function clear() {
    setQ('');
    setStatus('');
    setType('');
    startTransition(() => router.push(pathname));
  }

  return (
    <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="notif-q" className="text-sm font-medium text-foreground">
          {t('adminSearch')}
        </label>
        <Input id="notif-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder={t('notificationSearchPlaceholder')} />
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">{t('statusFilter')}</span>
        <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            <SelectItem value="failed">{t('statusFailed')}</SelectItem>
            <SelectItem value="pending">{t('statusPending')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">{t('emailType')}</span>
        <Select value={type || 'all'} onValueChange={(v) => setType(v === 'all' ? '' : v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            {Object.entries(NOTIFICATION_TYPE_LABEL_KEYS).map(([value, labelKey]) => (
              <SelectItem key={value} value={value}>
                {t(labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={submit} disabled={isPending} className="h-10 flex-1 lg:flex-none">
          {isPending ? t('loading') : t('filter')}
        </Button>
        <Button type="button" variant="outline" onClick={clear} disabled={isPending} className="h-10">
          {t('clear')}
        </Button>
      </div>
    </div>
  );
}
