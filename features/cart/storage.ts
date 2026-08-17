import type { Cart } from './types';

const STORAGE_KEY = 'rosette.cart.v1';

type StoredCart = Cart & { version: 1 };

export function readCart(): Cart {
  if (typeof window === 'undefined') return { lines: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lines: [] };
    const parsed = JSON.parse(raw) as Partial<StoredCart>;
    if (parsed.version !== 1 || !Array.isArray(parsed.lines)) throw new Error('invalid cart');
    return { lines: parsed.lines as Cart['lines'] };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return { lines: [] };
  }
}

export function writeCart(cart: Cart) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cart, version: 1 } satisfies StoredCart));
}

export function clearCartStorage() { if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY); }
