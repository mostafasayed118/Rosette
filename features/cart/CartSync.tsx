'use client';

import { useEffect } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useCart } from './CartProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';

// Module-level so the de-dup key and pending debounce survive navigation
// remounts. The previous component-scoped ref reset on every page change and
// forced a fresh sync even when the cart had not changed.
let lastSyncedKey: string | null = null;
let pendingDebounce: ReturnType<typeof setTimeout> | null = null;

export function CartSync() {
  const { cart, ready } = useCart();
  const { locale } = useI18n();
  const { city } = useStorePath();

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase || !ready) return;

    const push = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      const key = JSON.stringify(cart.lines);
      if (lastSyncedKey === key) return;
      lastSyncedKey = key;
      await fetch('/api/cart/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, locale, city, lines: cart.lines }),
      });
    };

    if (pendingDebounce) clearTimeout(pendingDebounce);
    pendingDebounce = setTimeout(() => { void push(); }, 600);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') void push();
    });

    return () => { if (pendingDebounce) clearTimeout(pendingDebounce); subscription.unsubscribe(); };
  }, [cart, ready, locale, city]);

  return null;
}
