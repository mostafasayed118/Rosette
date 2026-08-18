'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Re-runs the surrounding server component on an interval so fresh data
 * (e.g. new cancellation requests) appears without a manual reload.
 * Renders nothing. Skips refreshes while the tab is hidden and never
 * overlaps an in-flight refresh.
 */
export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let lastRefresh = 0;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefresh < intervalMs) return;
      lastRefresh = now;
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
