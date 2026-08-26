'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { clearWishlistStorage, readWishlist, writeWishlist } from './storage';

type WishlistContextValue = { ready: boolean; saved: string[]; isSaved: (slug: string) => boolean; count: number; toggle: (slug: string) => void };
const WishlistContext = createContext<WishlistContextValue | null>(null);
const SYNC_FLAG_KEY = 'rosette.wishlist.synced.v1';

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const [saved, setSaved] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setSaved(readWishlist());
      setReady(true);
      return;
    }
    const sync = async () => {
      const guest = readWishlist();
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (user) {
        setSignedIn(true);
        setUserId(user.id);
        try {
          const response = await fetch('/api/account/wishlist/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slugs: guest, locale }) });
          if (response.ok) {
            const body = (await response.json()) as { slugs?: string[] };
            setSaved(body.slugs ?? []);
            clearWishlistStorage();
          } else {
            setSaved(guest);
          }
        } catch {
          setSaved(guest);
        }
      } else {
        setSignedIn(false);
        setUserId(null);
        setSaved(guest);
      }
      setReady(true);
    };
    void sync();
    // The provider lives in the root layout and survives client-side
    // navigation, so it must re-sync when the auth state changes (sign-in
    // merges the guest list; sign-out drops back to guest storage).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void sync();
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  // Session-scoped personalization sync. Fires once per browser session when the
  // user logs in, so we don't hammer /api/wishlist/sync on every page navigation.
  // Reads the post-merge saved list (not the guest localStorage, which the merge
  // path clears above) so we always re-sync whatever the server should hold.
  useEffect(() => {
    if (!userId) return;
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(SYNC_FLAG_KEY)) return;
    const slugs = saved;
    if (!slugs.length) return;
    fetch('/api/wishlist/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs }),
    })
      .then(() => {
        if (typeof window !== 'undefined') window.sessionStorage.setItem(SYNC_FLAG_KEY, '1');
      })
      .catch(() => {});
    // Run only when userId flips; `saved` is captured at that moment and the
    // sessionStorage flag prevents re-entry, so the dep array stays tight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const toggle = useCallback(async (slug: string) => {
    if (inFlight.current.has(slug)) return;
    inFlight.current.add(slug);
    const wasSaved = saved.includes(slug);
    const next = wasSaved ? saved.filter((item) => item !== slug) : [...saved, slug];
    setSaved(next);
    if (!signedIn) {
      writeWishlist(next);
      inFlight.current.delete(slug);
      return;
    }
    try {
      const response = wasSaved
        ? await fetch(`/api/wishlist/items/${encodeURIComponent(slug)}`, { method: 'DELETE' })
        : await fetch('/api/wishlist/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, locale }) });
      if (!response.ok) setSaved(saved);
    } finally {
      inFlight.current.delete(slug);
    }
  }, [saved, signedIn, locale]);

  const value = useMemo<WishlistContextValue>(() => ({ ready, saved, isSaved: (slug) => saved.includes(slug), count: saved.length, toggle }), [ready, saved, toggle]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used inside WishlistProvider');
  return context;
}
