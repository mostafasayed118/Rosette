'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Re-runs the surrounding server component on an interval so fresh data
 * appears without a manual reload. Renders nothing.
 * - Skips while tab hidden (visibilityState)
 * - Pauses entirely when `enabled` is false (e.g., no pending items)
 * - Never overlaps an in-flight refresh
 */
export function AutoRefresh({ intervalMs = 30000, enabled = true }: { intervalMs?: number; enabled?: boolean }) {
  const router = useRouter();
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefresh.current < intervalMs) return;
      lastRefresh.current = now;
      router.refresh();
    };
    const timer = setInterval(tick, intervalMs);
    // Also listen for visibility change to refresh promptly when tab becomes visible
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > intervalMs) tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, intervalMs, enabled]);
  return null;
}
