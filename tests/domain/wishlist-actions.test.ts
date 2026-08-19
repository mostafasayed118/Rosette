import { describe, expect, it } from 'vitest';
import { mergeWishlist, removeWishlistItem, saveWishlistItem } from '@/features/wishlist/wishlist-actions';

// Table-aware fake: `products` resolves slug lookups (`.eq().maybeSingle()`
// for save/remove, `.in()` for merge), `wishlist_items` serves the select /
// insert / delete chains the service uses.
function fakeClient(options: { product?: unknown; products?: unknown[]; items?: unknown[]; insertError?: unknown; deleteError?: unknown } = {}) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const client = {
    from: (table: string) => table === 'products'
      ? {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: options.product ?? null, error: null }) }),
            in: () => ({ data: options.products ?? [], error: null }),
          }),
        }
      : {
          select: () => ({ eq: () => ({ order: () => ({ data: options.items ?? [], error: null }) }) }),
          insert: (payload: unknown) => { calls.push({ table, op: 'insert', payload }); return { onConflict: () => ({ doNothing: async () => ({ error: options.insertError ?? null }) }) }; },
          delete: () => { calls.push({ table, op: 'delete' }); return { eq: () => ({ eq: () => ({ error: options.deleteError ?? null }) }) }; },
          update: () => ({ eq: () => ({ error: null }) }),
        },
  };
  return { client, calls };
}

describe('saveWishlistItem', () => {
  it('resolves the slug, stores the locale, and inserts idempotently', async () => {
    const { client, calls } = fakeClient({ product: { id: 'p1' } });
    expect(await saveWishlistItem(client, { customerId: 'c1', slug: 'rose-hour', locale: 'fr' })).toEqual({ status: 'saved' });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'wishlist_items', op: 'insert', payload: { customer_id: 'c1', product_id: 'p1', locale: 'fr' } }));
  });

  it('returns not_found for an unknown slug', async () => {
    const { client } = fakeClient({ product: null });
    expect(await saveWishlistItem(client, { customerId: 'c1', slug: 'nope' })).toEqual({ status: 'not_found' });
  });

  it('returns failure when the insert errors', async () => {
    const { client } = fakeClient({ product: { id: 'p1' }, insertError: new Error('db down') });
    expect(await saveWishlistItem(client, { customerId: 'c1', slug: 'rose-hour' })).toEqual({ status: 'failure' });
  });
});

describe('removeWishlistItem', () => {
  it('resolves the slug and deletes the row', async () => {
    const { client, calls } = fakeClient({ product: { id: 'p1' } });
    expect(await removeWishlistItem(client, { customerId: 'c1', slug: 'rose-hour' })).toEqual({ status: 'removed' });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'wishlist_items', op: 'delete' }));
  });

  it('returns not_found for an unknown slug', async () => {
    const { client } = fakeClient({ product: null });
    expect(await removeWishlistItem(client, { customerId: 'c1', slug: 'nope' })).toEqual({ status: 'not_found' });
  });
});

describe('mergeWishlist', () => {
  it('inserts missing rows with the locale and returns the full server list', async () => {
    const { client, calls } = fakeClient({
      products: [{ id: 'p1' }, { id: 'p2' }],
      items: [{ products: { slug: 'rose-hour' } }, { products: { slug: 'citrus-cloud' } }],
    });
    const result = await mergeWishlist(client, { customerId: 'c1', slugs: ['rose-hour', 'citrus-cloud'], locale: 'ar' });
    expect(result).toEqual({ status: 'merged', slugs: ['rose-hour', 'citrus-cloud'] });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'wishlist_items', op: 'insert', payload: [{ customer_id: 'c1', product_id: 'p1', locale: 'ar' }, { customer_id: 'c1', product_id: 'p2', locale: 'ar' }] }));
  });

  it('dedupes slugs, ignores unknown ones, and defaults the locale to en', async () => {
    const { client, calls } = fakeClient({ products: [{ id: 'p1' }], items: [{ products: { slug: 'rose-hour' } }] });
    const result = await mergeWishlist(client, { customerId: 'c1', slugs: ['rose-hour', 'rose-hour', 'nope'] });
    expect(result).toEqual({ status: 'merged', slugs: ['rose-hour'] });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'wishlist_items', op: 'insert', payload: [{ customer_id: 'c1', product_id: 'p1', locale: 'en' }] }));
  });

  it('returns the server list without inserting when the guest list is empty', async () => {
    const { client, calls } = fakeClient({ items: [{ products: { slug: 'rose-hour' } }] });
    expect(await mergeWishlist(client, { customerId: 'c1', slugs: [] })).toEqual({ status: 'merged', slugs: ['rose-hour'] });
    expect(calls.filter((call) => call.table === 'wishlist_items' && call.op === 'insert')).toEqual([]);
  });
});
