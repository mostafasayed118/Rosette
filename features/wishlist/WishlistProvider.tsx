'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { clearWishlistStorage, readWishlist, writeWishlist } from './storage';

type WishlistContextValue = { ready: boolean; saved: string[]; isSaved: (slug: string) => boolean; count: number; toggle: (slug: string) => void };
const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const [saved, setSaved] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    (async () => {
      const guest = readWishlist();
      const supabase = getBrowserSupabase();
      if (!supabase) {
        if (active) { setSaved(guest); setReady(true); }
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (user) {
        setSignedIn(true);
        try {
          const response = await fetch('/api/account/wishlist/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slugs: guest, locale }) });
          if (response.ok) {
            const body = (await response.json()) as { slugs?: string[] };
            setSaved(body.slugs ?? []);
            writeWishlist([]);
          } else {
            setSaved(guest);
          }
        } catch {
          setSaved(guest);
        }
      } else {
        setSignedIn(false);
        setSaved(guest);
      }
      setReady(true);
    })();
    return () => { active = false; };
  }, []);

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
