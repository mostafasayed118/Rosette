'use client';

import { useEffect, useState } from 'react';

export type DeliveryFeeState = { feeMinor: number | null; loading: boolean };

export function useDeliveryFee(cityCode: string | null | undefined): DeliveryFeeState {
  const [state, setState] = useState<DeliveryFeeState>({ feeMinor: null, loading: Boolean(cityCode) });

  useEffect(() => {
    if (!cityCode) {
      setState({ feeMinor: null, loading: false });
      return;
    }
    let cancelled = false;
    setState((current) => (current.loading ? current : { ...current, loading: true }));
    fetch(`/api/delivery-fee?city=${encodeURIComponent(cityCode)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`delivery fee lookup failed: ${response.status}`);
        return response.json() as Promise<{ feeMinor?: number }>;
      })
      .then((data) => {
        if (!cancelled) setState({ feeMinor: typeof data.feeMinor === 'number' ? data.feeMinor : null, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ feeMinor: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [cityCode]);

  return state;
}