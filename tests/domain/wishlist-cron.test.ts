import { describe, expect, it, vi } from 'vitest';
import { renderWishlistEmail, sendWishlistEmail } from '@/features/wishlist/email';
import { runWishlistCron } from '@/features/wishlist/wishlist-cron';

type PreferenceStatus = 'enabled' | 'disabled' | 'error';

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

function makeClient(rows: unknown[], preferenceStatus: PreferenceStatus = 'enabled') {
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const client = {
    from: (table: string) => table === 'wishlist_items'
      ? {
          select: () => ({ limit: () => ({ data: rows, error: null }) }),
          update: (payload: Record<string, unknown>) => ({ eq: (_col: string, id: string) => { updates.push({ id, payload }); return { error: null }; } }),
        }
      : {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({
              data: preferenceStatus === 'disabled' ? { engagement_enabled: false } : null,
              error: preferenceStatus === 'error' ? { message: 'database unavailable' } : null,
            }) }),
          }),
        },
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

  it('renders a signed engagement unsubscribe link when provided', () => {
    const email = renderWishlistEmail({ locale: 'en', type: 'wishlist_back_in_stock', productName: 'Rose bouquet', productUrl: 'https://x/product', unsubscribeUrl: 'https://x/unsubscribe?email=a%40b.com&token=abc' });
    expect(email.text).toContain('https://x/unsubscribe?email=a%40b.com&token=abc');
    expect(email.html).toContain('https://x/unsubscribe?email=a%40b.com&amp;token=abc');
  });

  it('adds RFC unsubscribe headers when sending engagement mail', async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue(undefined) };
    await sendWishlistEmail({ to: 'buyer@example.com', locale: 'en', type: 'wishlist_back_in_stock', productName: 'Rose bouquet', productUrl: 'https://x/product', unsubscribeUrl: 'https://x/unsubscribe' }, transport);
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({ headers: { 'List-Unsubscribe': '<https://x/unsubscribe>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }));
  });
});

describe('runWishlistCron', () => {
  it('sends a price-drop email and updates snapshots', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { client, updates } = makeClient([row({ products: { ...row().products, price_minor: 8000 } })]);
    const summary = await runWishlistCron(client, { origin: 'https://example.com', secret: 'secret', send });
    expect(summary).toEqual({ checked: 1, sent: 1, failed: 0, suppressed: 0 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'wishlist_price_drop', priceMinor: 8000, unsubscribeUrl: expect.stringContaining('/api/email-preferences/unsubscribe') }));
    expect(updates[0]!.payload).toEqual({ last_price_minor: 8000, last_available_stock: 3 });
  });

  it('sends a back-in-stock email when stock returns', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { client } = makeClient([row({ last_available_stock: 0, products: { ...row().products, product_variants: [{ id: 'v1', price_delta_minor: 0, active: true, inventory: [{ quantity: 2, reserved_quantity: 0 }] }] } })]);
    const summary = await runWishlistCron(client, { origin: 'https://example.com', secret: 'secret', send });
    expect(summary).toEqual({ checked: 1, sent: 1, failed: 0, suppressed: 0 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'wishlist_back_in_stock' }));
  });

  it('skips the snapshot write when nothing changed', async () => {
    const send = vi.fn();
    const { client, updates } = makeClient([row()]);
    const summary = await runWishlistCron(client, { origin: 'https://example.com', secret: 'secret', send });
    expect(summary).toEqual({ checked: 1, sent: 0, failed: 0, suppressed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('records a snapshot without emailing when only the stock count moved', async () => {
    const send = vi.fn();
    const { client, updates } = makeClient([row({ last_available_stock: 2 })]);
    const summary = await runWishlistCron(client, { origin: 'https://example.com', secret: 'secret', send });
    expect(summary).toEqual({ checked: 1, sent: 0, failed: 0, suppressed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(updates[0]!.payload).toEqual({ last_price_minor: 10000, last_available_stock: 3 });
  });

  it('counts send failures without aborting the loop', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('smtp down')).mockResolvedValue(undefined);
    const rows = [row({ products: { ...row().products, price_minor: 8000 } }), row({ id: 'w2', last_available_stock: 0, products: { ...row().products, product_variants: [{ id: 'v1', price_delta_minor: 0, active: true, inventory: [{ quantity: 1, reserved_quantity: 0 }] }] } })];
    const { client } = makeClient(rows);
    const summary = await runWishlistCron(client, { origin: 'https://example.com', secret: 'secret', send });
    expect(summary).toEqual({ checked: 2, sent: 1, failed: 1, suppressed: 0 });
  });

  it('does not email a customer without a profile email (counted as failed)', async () => {
    const send = vi.fn();
    const { client } = makeClient([row({ profiles: null, products: { ...row().products, price_minor: 8000 } })]);
    const summary = await runWishlistCron(client, { origin: 'https://example.com', secret: 'secret', send });
    expect(summary).toEqual({ checked: 1, sent: 0, failed: 1, suppressed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('suppresses a changed wishlist item but records the new snapshot', async () => {
    const { client, updates } = makeClient([row({ products: { ...row().products, price_minor: 8000 } })], 'disabled');
    const summary = await runWishlistCron(client, { origin: 'https://example.com', secret: 'secret', send: vi.fn() });
    expect(summary).toEqual({ checked: 1, sent: 0, failed: 0, suppressed: 1 });
    expect(updates[0]!.payload).toEqual({ last_price_minor: 8000, last_available_stock: 3 });
  });

  it('does not consume a changed event when preference lookup fails', async () => {
    const { client, updates } = makeClient([row({ products: { ...row().products, price_minor: 8000 } })], 'error');
    const summary = await runWishlistCron(client, { origin: 'https://example.com', secret: 'secret', send: vi.fn() });
    expect(summary).toEqual({ checked: 1, sent: 0, failed: 1, suppressed: 0 });
    expect(updates).toEqual([]);
  });
});
