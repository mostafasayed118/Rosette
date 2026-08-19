import { describe, expect, it, vi } from 'vitest';
import { renderWishlistEmail } from '@/features/wishlist/email';
import { runWishlistCron } from '@/features/wishlist/wishlist-cron';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'w1',
  customer_id: 'c1',
  last_price_minor: 10000,
  last_available_stock: 3,
  locale: 'en',
  profiles: { email: 'buyer@example.com' },
  products: {
    id: 'p1', slug: 'rose-hour', name_en: 'Rose bouquet', price_minor: 10000,
    product_variants: [{ id: 'v1', price_delta_minor: 0, active: true, inventory: [{ quantity: 3, reserved_quantity: 0 }] }],
  },
  ...overrides,
});

// The cron only touches `wishlist_items` (select all rows + per-row snapshot
// updates), so the fake needs just those two chains.
function makeClient(rows: unknown[]) {
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const client = {
    from: (table: string) => table === 'wishlist_items'
      ? {
          select: () => ({ data: rows, error: null }),
          update: (payload: Record<string, unknown>) => ({ eq: (_col: string, id: string) => { updates.push({ id, payload }); return { error: null }; } }),
        }
      : { select: () => ({ data: [], error: null }) },
  };
  return { client, updates };
}

describe('renderWishlistEmail', () => {
  it('renders a price-drop email with the new price', () => {
    const email = renderWishlistEmail({ locale: 'en', type: 'wishlist_price_drop', productName: 'Rose bouquet', priceMinor: 8000, productUrl: 'https://example.com/en/cairo/shop/rose-hour' });
    expect(email.subject).toBe('A flower you saved just dropped in price');
    expect(email.text).toContain('Rose bouquet');
    expect(email.text).toContain('80');
  });

  it('renders a back-in-stock email with the product name', () => {
    const email = renderWishlistEmail({ locale: 'fr', type: 'wishlist_back_in_stock', productName: 'Rose bouquet', productUrl: 'https://example.com/en/cairo/shop/rose-hour' });
    expect(email.subject).toContain('Rose bouquet');
  });
});

describe('runWishlistCron', () => {
  it('sends a price-drop email and updates snapshots', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { client, updates } = makeClient([row({ products: { ...row().products, price_minor: 8000 } })]);
    const summary = await runWishlistCron(client, { origin: 'https://example.com', send });
    expect(summary).toEqual({ checked: 1, sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'wishlist_price_drop', priceMinor: 8000 }));
    expect(updates[0]!.payload).toEqual({ last_price_minor: 8000, last_available_stock: 3 });
  });

  it('sends a back-in-stock email when stock returns', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { client } = makeClient([row({ last_available_stock: 0, products: { ...row().products, product_variants: [{ id: 'v1', price_delta_minor: 0, active: true, inventory: [{ quantity: 2, reserved_quantity: 0 }] }] } })]);
    const summary = await runWishlistCron(client, { origin: 'https://example.com', send });
    expect(summary).toEqual({ checked: 1, sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'wishlist_back_in_stock' }));
  });

  it('records snapshots without emailing when nothing changed', async () => {
    const send = vi.fn();
    const { client, updates } = makeClient([row()]);
    const summary = await runWishlistCron(client, { origin: 'https://example.com', send });
    expect(summary).toEqual({ checked: 1, sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(updates[0]!.payload).toEqual({ last_price_minor: 10000, last_available_stock: 3 });
  });

  it('counts send failures without aborting the loop', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('smtp down')).mockResolvedValue(undefined);
    const rows = [row({ products: { ...row().products, price_minor: 8000 } }), row({ id: 'w2', last_available_stock: 0, products: { ...row().products, product_variants: [{ id: 'v1', price_delta_minor: 0, active: true, inventory: [{ quantity: 1, reserved_quantity: 0 }] }] } })];
    const { client } = makeClient(rows);
    const summary = await runWishlistCron(client, { origin: 'https://example.com', send });
    expect(summary).toEqual({ checked: 2, sent: 1, failed: 1 });
  });

  it('does not email a customer without a profile email (counted as failed)', async () => {
    const send = vi.fn();
    // Give the row a price drop so the email path is reached (a no-change row
    // returns before the profile check and never counts as failed).
    const { client } = makeClient([row({ profiles: null, products: { ...row().products, price_minor: 8000 } })]);
    const summary = await runWishlistCron(client, { origin: 'https://example.com', send });
    expect(summary).toEqual({ checked: 1, sent: 0, failed: 1 });
    expect(send).not.toHaveBeenCalled();
  });
});
