import type { Cart } from './types';

const STORAGE_KEY = 'rosette.cart.v2';
const LEGACY_KEY = 'rosette.cart.v1';

export function readCart(): Cart {
  if (typeof window === 'undefined') return { version: 2, lines: [], recipients: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Cart>;
      if (parsed && parsed.version === 2 && Array.isArray(parsed.lines)) {
        return { version: 2, lines: parsed.lines as Cart['lines'], recipients: Array.isArray(parsed.recipients) ? parsed.recipients : [] };
      }
    }
    // Migrate a legacy v1 cart: it has no recipients, so default to none.
    const legacyRaw = window.localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as { version?: number; lines?: unknown };
      if (legacy && legacy.version === 1 && Array.isArray(legacy.lines)) {
        return { version: 2, lines: legacy.lines as Cart['lines'], recipients: [] };
      }
    }
    throw new Error('invalid cart');
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return { version: 2, lines: [], recipients: [] };
  }
}

export function writeCart(cart: Cart) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

export function clearCartStorage() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_KEY);
  }
}