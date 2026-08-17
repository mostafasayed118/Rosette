import type { Destination } from './types';

const STORAGE_KEY = 'rosette.destination.v1';

type StoredDestination = Destination & { version: 1 };

export function readDestination(): Destination | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDestination>;
    if (parsed.version !== 1 || typeof parsed.countryCode !== 'string' || typeof parsed.cityCode !== 'string') {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return { countryCode: parsed.countryCode, cityCode: parsed.cityCode };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function writeDestination(destination: Destination) {
  if (typeof window === 'undefined') return;
  const value: StoredDestination = { ...destination, version: 1 };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearDestination() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
}
