const STORAGE_KEY = 'rosette.wishlist.v1';

export function readWishlist(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.some((slug) => typeof slug !== 'string')) throw new Error('invalid wishlist');
    return parsed;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

export function writeWishlist(slugs: string[]) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
}

export function clearWishlistStorage() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
}
