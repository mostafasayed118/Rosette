'use client';

import { useEffect, useState, useTransition } from 'react';
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
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setAction(searchParams.get('action') ?? '');
    setTargetType(searchParams.get('targetType') ?? '');
  }, [searchParams]);

  function submit() {
    const params = new URLSearchParams();
    if (action) params.set('action', action);
    if (targetType) params.set('targetType', targetType);
    startTransition(() => router.push(`${pathname}${params.toString() ? `?${params}` : ''}`));
  }

  function clear() {
    setAction('');
    setTargetType('');
    startTransition(() => router.push(pathname));
  }

  return (
    <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[1fr_1fr_auto] lg:gap-4">
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">{t('auditAction')}</span>
        <Select value={action || 'all'} onValueChange={(v) => setAction(v === 'all' ? '' : v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            {actions.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">{t('auditTarget')}</span>
        <Select value={targetType || 'all'} onValueChange={(v) => setTargetType(v === 'all' ? '' : v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            {targetTypes.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
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
