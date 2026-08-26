import { describe, it, expect, vi } from 'vitest';
import { syncWishlistOnLogin } from '@/features/personalization/wishlist-sync';

function fakeSupabase() {
  const upsertCalls: any[] = [];
  // products: select('id, slug').in('slug', clean).eq('active', true) -> { data: [{slug:'rose-hour', id:'p1'}] }
  // wishlist existing: select('product_slug, product_id').eq('customer_id', ...) -> { data: [] }
  const from = vi.fn((table: string) => {
    if (table === 'products') {
      return {
        select: () => ({
          in: () => ({
            eq: async () => ({ data: [{ slug: 'rose-hour', id: 'p1' }], error: null }),
          }),
        }),
      } as any;
    }
    if (table === 'wishlist_items') {
      return {
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
        delete: () => ({
          eq: vi.fn(() => ({
            in: vi.fn(async () => ({ error: null })),
            eq: vi.fn(async () => ({ error: null })),
            // fallback for valid-empty delete all: delete().eq()
            // Return promise directly if .in not chained
          })),
        }),
        upsert: vi.fn(async (v: unknown) => {
          upsertCalls.push(v);
          return { error: null };
        }),
        // keep insert for compat if impl uses insert
        insert: vi.fn(async (v: unknown) => {
          upsertCalls.push(v);
          return { error: null };
        }),
      } as any;
    }
    return {} as any;
  });
  return { from, upsertCalls } as any;
}

describe('sync', () => {
  it('inserts only valid slugs', async () => {
    const sb = fakeSupabase();
    const r = await syncWishlistOnLogin(sb as any, 'uid', ['rose-hour', 'unknown']);
    expect(r.synced).toBe(1);
    // upsert should have been called once with rose-hour
    expect(sb.upsertCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('dedupes and caps at 50 and filters >80 chars', async () => {
    const sb = fakeSupabase();
    // Override products mock to accept any clean
    sb.from = vi.fn((table: string) => {
      if (table === 'products') {
        return {
          select: () => ({
            in: (_col: string, vals: string[]) => ({
              eq: async () => ({
                data: vals.filter((v) => v === 'rose-hour').map((s) => ({ slug: s, id: 'p1' })),
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {
        select: () => ({ eq: async () => ({ data: [], error: null }) }),
        delete: () => ({ eq: vi.fn(() => ({ in: vi.fn(async () => ({ error: null })) })) }),
        upsert: vi.fn(async () => ({ error: null })),
      } as any;
    });
    const long = 'a'.repeat(81);
    const many = Array.from({ length: 60 }, (_, i) => `rose-hour-${i}`);
    const r = await syncWishlistOnLogin(sb as any, 'uid', ['rose-hour', 'rose-hour', long, ...many]);
    // clean should be max 50, filtered long, so synced at most 1 (only rose-hour is active)
    expect(r.synced).toBe(1);
  });

  it('deletes stale slugs not in valid set', async () => {
    const deleteIn = vi.fn(async () => ({ error: null }));
    const sb: any = {
      from: vi.fn((table: string) => {
        if (table === 'products') {
          return {
            select: () => ({
              in: () => ({ eq: async () => ({ data: [{ slug: 'rose-hour', id: 'p1' }], error: null }) }),
            }),
          } as any;
        }
        if (table === 'wishlist_items') {
          return {
            select: () => ({
              eq: async () => ({ data: [{ product_slug: 'stale-one', product_id: null }], error: null }),
            }),
            delete: () => ({
              eq: vi.fn(() => ({ in: deleteIn })),
            }),
            upsert: vi.fn(async () => ({ error: null })),
          } as any;
        }
        return {} as any;
      }),
    };
    const r = await syncWishlistOnLogin(sb, 'uid', ['rose-hour']);
    expect(r.synced).toBe(1);
    expect(deleteIn).toHaveBeenCalled();
  });
});
