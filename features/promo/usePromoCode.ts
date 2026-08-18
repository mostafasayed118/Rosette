'use client';

import { useState } from 'react';

export type PromoCodeState = { state: 'idle' | 'valid' | 'invalid'; discountMinor: number | null; error: string | null; code: string; setCode: (code: string) => void; confirm: () => void };

export function usePromoCode(subtotalMinor: number): PromoCodeState {
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const [discountMinor, setDiscountMinor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    const trimmed = code.trim();
    if (!trimmed) { setApplied(null); setDiscountMinor(null); setError(null); return; }
    const response = await fetch(`/api/promo/validate?code=${encodeURIComponent(trimmed)}&subtotal=${subtotalMinor}`);
    const data = await response.json() as { valid?: boolean; discountMinor?: number; error?: string };
    if (!response.ok || !data.valid) { setApplied(null); setDiscountMinor(null); setError(data.error ?? 'not_found'); return; }
    setApplied(trimmed);
    setDiscountMinor(data.discountMinor ?? 0);
    setError(null);
  }

  return { state: applied ? 'valid' : error ? 'invalid' : 'idle', discountMinor, error, code, setCode, confirm };
}
