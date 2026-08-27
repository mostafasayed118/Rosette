'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { deferToTask } from '@/hooks/use-deferred-task';
import { clearWishlistStorage, readWishlist, writeWishlist } from './storage';

type WishlistContextValue = { ready: boolean; saved: string[]; isSaved: (slug: string) => boolean; count: number; toggle: (slug: string) => void };
const WishlistContext = createContext<WishlistContextValue | null>(null);
const SYNC_FLAG_KEY = 'rosette.wishlist.synced.v1';

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  // The mount effect intentionally runs once; keep the freshest locale for
  // merge calls through a ref instead of re-subscribing auth listeners on
  // every locale change.
  const localeRef = useRef(locale);
  useEffect(() => { localeRef.current = locale; }, [locale]);
  const [saved, setSaved] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // Canonical post-merge snapshot. The session-scoped /api/wishlist/sync effect
  // depends on this (not on `userId`) so it only fires once the merge response
  // has populated the canonical list — fixes the stale-closure bug where the
  // effect previously captured an empty pre-merge `saved` array and skipped.
  const [mergedSlugs, setMergedSlugs] = useState<string[] | null>(null);
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const supabase = getBrowserSupabase();
    if (!supabase) {
      deferToTask(() => {
        if (!active) return;
        setSaved(readWishlist());
        setReady(true);
      });
      return;
    }
    const sync = async () => {
      const guest = readWishlist();
      const locale = localeRef.current;
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (user) {
        setSignedIn(true);
        setUserId(user.id);
        try {
          const response = await fetch('/api/account/wishlist/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slugs: guest, locale }) });
          if (response.ok) {
            const body = (await response.json()) as { slugs?: string[] };
            const canonical = body.slugs ?? [];
            setSaved(canonical);
            setMergedSlugs(canonical);
            clearWishlistStorage();
          } else {
            setSaved(guest);
            setMergedSlugs(null);
          }
        } catch {
          setSaved(guest);
          setMergedSlugs(null);
        }
      } else {
        setSignedIn(false);
        setUserId(null);
        setSaved(guest);
        setMergedSlugs(null);
      }
      setReady(true);
    };
    void sync();
    // The provider lives in the root layout and survives client-side
    // navigation, so it must re-sync when the auth state changes (sign-in
    // merges the guest list; sign-out drops back to guest storage).
    // `localeRef` supplies the current locale without widening this dep array,
    // which would tear down and recreate the auth subscription per switch.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void sync();
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  // Session-scoped personalization sync. Fires once per browser session after
  // the merge response populates the canonical `mergedSlugs` snapshot, so the
  // server-side wishlist used by personalized picks reflects the merged list.
  // The sessionStorage flag is only set on response.ok — a transient failure
  // clears the flag so the next render retries (M-01).
  useEffect(() => {
    if (!userId) return;
    if (mergedSlugs === null) return;
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(SYNC_FLAG_KEY)) return;
    if (!mergedSlugs.length) return;
    fetch('/api/wishlist/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: mergedSlugs }),
    })
      .then((r) => {
        if (typeof window === 'undefined') return;
        if (r.ok) window.sessionStorage.setItem(SYNC_FLAG_KEY, '1');
        else window.sessionStorage.removeItem(SYNC_FLAG_KEY);
      })
      .catch(() => {
        if (typeof window !== 'undefined') window.sessionStorage.removeItem(SYNC_FLAG_KEY);
      });
    // `mergedSlugs` is the canonical post-merge list; the sessionStorage flag
    // prevents re-entry, so the dep array stays tight.
  }, [userId, mergedSlugs]);

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
