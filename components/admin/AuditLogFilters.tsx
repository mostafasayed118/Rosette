'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/features/i18n/I18nProvider';

export function AuditLogFilters({ actions, targetTypes }: { actions: string[]; targetTypes: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [action, setAction] = useState(searchParams.get('action') ?? '');
  const [targetType, setTargetType] = useState(searchParams.get('targetType') ?? '');

  function submit() {
    const params = new URLSearchParams();
    if (action) params.set('action', action);
    if (targetType) params.set('targetType', targetType);
    router.push(`${pathname}${params.toString() ? `?${params}` : ''}`);
  }

  return <div className="my-4 grid grid-cols-[repeat(2,1fr)_auto] items-end gap-3 max-md:grid-cols-1">
    <div className="grid gap-1.5">
      <span className="text-sm font-bold text-foreground">{t('auditAction')}</span>
      <Select value={action || 'all'} onValueChange={(v) => setAction(v === 'all' ? '' : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('all')}</SelectItem>
          {actions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <div className="grid gap-1.5">
      <span className="text-sm font-bold text-foreground">{t('auditTarget')}</span>
      <Select value={targetType || 'all'} onValueChange={(v) => setTargetType(v === 'all' ? '' : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('all')}</SelectItem>
          {targetTypes.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <Button type="button" onClick={submit}>{t('filter')}</Button>
  </div>;
}
