'use client';

import { useState, type ReactNode } from 'react';
import { MotionProvider } from '@/components/motion';

const REDUCE_MOTION_COOKIE = 'rosette-reduce-motion=1';

/**
 * Reads the reduce-motion cookie during the first client render instead of on
 * the server: `cookies()` in the root layout forces every route to render
 * dynamically, which defeats static rendering and ISR for the whole storefront.
 * `MotionConfig` renders no DOM, so reading the cookie at hydration cannot
 * produce a hydration mismatch — it only seeds the motion preference one tick
 * earlier than the account dashboard toggle would.
 */
export function ReduceMotionProvider({ children }: { children: ReactNode }) {
  const [initialReduceMotion] = useState(() =>
    typeof document === 'undefined' ? false : document.cookie.split('; ').includes(REDUCE_MOTION_COOKIE),
  );
  return <MotionProvider initialReduceMotion={initialReduceMotion}>{children}</MotionProvider>;
}
