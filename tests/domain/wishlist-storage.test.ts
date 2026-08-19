import { beforeEach, describe, expect, it } from 'vitest';
import { clearWishlistStorage, readWishlist, writeWishlist } from '@/features/wishlist/storage';

describe('wishlist storage', () => {
  beforeEach(() => localStorage.clear());

  it('reads an empty wishlist when nothing is stored', () => {
    expect(readWishlist()).toEqual([]);
  });

  it('round-trips slugs', () => {
    writeWishlist(['rose-hour', 'citrus-cloud']);
    expect(readWishlist()).toEqual(['rose-hour', 'citrus-cloud']);
  });

  it('clears stored slugs', () => {
    writeWishlist(['rose-hour']);
    clearWishlistStorage();
    expect(readWishlist()).toEqual([]);
  });

  it('recovers from invalid stored JSON', () => {
    localStorage.setItem('rosette.wishlist.v1', '{not json');
    expect(readWishlist()).toEqual([]);
    expect(localStorage.getItem('rosette.wishlist.v1')).toBeNull();
  });

  it('recovers from a stored array of non-strings', () => {
    localStorage.setItem('rosette.wishlist.v1', JSON.stringify([1, 2]));
    expect(readWishlist()).toEqual([]);
  });
});
