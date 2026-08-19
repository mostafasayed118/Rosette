'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useCart } from './CartProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import type { CartLine } from './types';

export function RestoreCart() {
  const { t } = useI18n();
  const router = useRouter();
  const { href } = useStorePath();
  const params = useSearchParams();
  const token = params.get('restore');
  const { cart, ready, restoreCart } = useCart();
  const [pending, setPending] = useState<CartLine[] | null>(null);

  useEffect(() => {
    if (!token || !ready || !getBrowserSupabase()) return;
    let active = true;
    (async () => {
      router.replace(href('/cart'), { scroll: false });
      const response = await fetch(`/api/cart/restore?token=${encodeURIComponent(token)}`);
      if (!response.ok || !active) return;
      const body = (await response.json()) as { lines?: unknown };
      if (!Array.isArray(body.lines)) return;
      const lines = body.lines as CartLine[];
      if (cart.lines.length === 0) restoreCart(lines);
      else setPending(lines);
    })();
    return () => { active = false; };
  }, [token, ready]);

  if (!pending) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="font-bold">{t('restorePrompt')}</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => { restoreCart(pending); setPending(null); }}>{t('restoreNow')}</Button>
        <Button size="sm" variant="outline" onClick={() => setPending(null)}>{t('restoreDiscard')}</Button>
      </div>
    </div>
  );
}
