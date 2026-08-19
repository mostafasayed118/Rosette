'use client';

import { useEffect, useRef } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useCart } from './CartProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';

export function CartSync() {
  const { cart, ready } = useCart();
  const { locale } = useI18n();
  const { city } = useStorePath();
  const lastSynced = useRef<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase || !ready) return;

    const push = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      const key = JSON.stringify(cart.lines);
      if (lastSynced.current === key) return;
      lastSynced.current = key;
      await fetch('/api/cart/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, locale, city, lines: cart.lines }),
      });
    };

    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { void push(); }, 600);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') void push();
    });

    return () => { if (debounce.current) clearTimeout(debounce.current); subscription.unsubscribe(); };
  }, [cart, ready, locale, city]);

  return null;
}
