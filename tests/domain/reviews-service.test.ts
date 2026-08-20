import { describe, expect, it, vi } from 'vitest';
import { submitProductReview, reviewProductReview } from '@/features/reviews/reviews-service';

type Call = { table: string; op: string; payload?: unknown; eq?: Array<[string, unknown]> };

function fakeClient(options: { product?: unknown; orders?: unknown[]; existingReview?: unknown; insertError?: unknown; updateError?: unknown; deleteError?: unknown } = {}) {
  const calls: Call[] = [];
  const record = (table: string, op: string, payload?: unknown) => calls.push({ table, op, payload });
  const from = (table: string) => {
    if (table === 'orders') {
      return {
        select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: options.orders ?? [], error: null }) }) }) }),
      };
    }
    if (table === 'products') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: options.product ?? null, error: null }) }) }),
      };
    }
    if (table === 'product_reviews') {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: options.existingReview ?? null, error: null }) }) }) }),
        insert: (payload: unknown) => { record(table, 'insert', payload); return { select: () => ({ single: async () => ({ data: { id: 'rev-1' }, error: options.insertError ?? null }) }) }; },
        update: (payload: unknown) => ({ eq: (_col: string, id: string) => { record(table, 'update', payload); return { error: options.updateError ?? null }; } }),
        delete: () => ({ eq: (_col: string, id: string) => { record(table, 'delete'); return { error: options.deleteError ?? null }; } }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  };
  return { client: { from }, calls };
}

const admin = { userId: 'a1', role: 'admin' as const };
const product = { id: 'prod-1', slug: 'rose-hour' };
const paidOrder = { id: 'o1', created_at: '2026-08-01T00:00:00Z', payment_status: 'paid', order_items: [{ product_slug: 'rose-hour', product_id: 'prod-1' }] };

describe('submitProductReview', () => {
  it('creates a pending review for a verified purchase', async () => {
    const { client, calls } = fakeClient({ product, orders: [paidOrder] });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 5, body: '  Gorgeous  ' });
    expect(result).toEqual({ status: 'created' });
    const insert = calls.find((call) => call.table === 'product_reviews');
    expect(insert?.payload).toEqual(expect.objectContaining({ product_id: 'prod-1', order_id: 'o1', customer_id: 'c1', rating: 5, body: 'Gorgeous', status: 'pending' }));
  });

  it('returns not_verified when the customer has no paid order for the product', async () => {
    const { client } = fakeClient({ product, orders: [{ ...paidOrder, payment_status: 'pending' }] });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 5, body: 'ok' });
    expect(result).toEqual({ status: 'not_verified' });
  });

  it('returns not_verified when no order contains the product at all', async () => {
    const { client } = fakeClient({ product, orders: [{ ...paidOrder, order_items: [{ product_slug: 'other', product_id: 'other-id' }] }] });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 5, body: 'ok' });
    expect(result).toEqual({ status: 'not_verified' });
  });

  it('matches order items by slug or product id', async () => {
    const { client } = fakeClient({ product, orders: [{ ...paidOrder, order_items: [{ product_slug: 'other', product_id: 'prod-1' }] }] });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 4, body: 'ok' });
    expect(result).toEqual({ status: 'created' });
  });

  it('returns already_reviewed for a duplicate on the same order and product', async () => {
    const { client } = fakeClient({ product, orders: [paidOrder], existingReview: { id: 'rev-0' } });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 4, body: 'ok' });
    expect(result).toEqual({ status: 'already_reviewed' });
  });

  it('returns not_found when the product slug is unknown', async () => {
    const { client } = fakeClient({ product: null });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'nope', rating: 4, body: 'ok' });
    expect(result).toEqual({ status: 'not_found' });
  });

  it('returns invalid for out-of-range ratings or empty bodies', async () => {
    const { client } = fakeClient({ product, orders: [paidOrder] });
    expect(await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 9, body: 'ok' })).toEqual({ status: 'invalid' });
    expect(await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 4, body: '   ' })).toEqual({ status: 'invalid' });
  });

  it('returns failure when the insert errors', async () => {
    const { client } = fakeClient({ product, orders: [paidOrder], insertError: { message: 'constraint' } });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 4, body: 'ok' });
    expect(result).toEqual({ status: 'failure' });
  });

  it('stores photos when valid photoUrls are provided', async () => {
    const { client, calls } = fakeClient({ product, orders: [paidOrder] });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 5, body: 'ok', photoUrls: ['https://x.supabase.co/storage/v1/object/public/review-images/a.jpg'] });
    expect(result).toEqual({ status: 'created' });
    const insert = calls.find((call) => call.table === 'product_reviews');
    expect(insert?.payload).toEqual(expect.objectContaining({ photos: ['https://x.supabase.co/storage/v1/object/public/review-images/a.jpg'] }));
  });

  it('returns invalid for a foreign photo URL', async () => {
    const { client } = fakeClient({ product, orders: [paidOrder] });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 5, body: 'ok', photoUrls: ['https://evil.com/a.jpg'] });
    expect(result).toEqual({ status: 'invalid' });
  });

  it('returns invalid for more than 3 photos', async () => {
    const url = 'https://x.supabase.co/storage/v1/object/public/review-images/';
    const { client } = fakeClient({ product, orders: [paidOrder] });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 5, body: 'ok', photoUrls: [`${url}1.jpg`, `${url}2.jpg`, `${url}3.jpg`, `${url}4.jpg`] });
    expect(result).toEqual({ status: 'invalid' });
  });
});

describe('reviewProductReview', () => {
  it('approves a pending review', async () => {
    const { client, calls } = fakeClient({});
    const result = await reviewProductReview(client, { admin, reviewId: 'rev-1', action: 'approve' });
    expect(result).toEqual({ status: 'approved' });
    const update = calls.find((call) => call.table === 'product_reviews');
    expect(update?.payload).toEqual(expect.objectContaining({ status: 'approved', reviewed_by: 'a1' }));
  });

  it('rejects by deleting the review', async () => {
    const { client, calls } = fakeClient({});
    const result = await reviewProductReview(client, { admin, reviewId: 'rev-1', action: 'reject' });
    expect(result).toEqual({ status: 'rejected' });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'product_reviews', op: 'delete' }));
  });

  it('returns failure when the update errors', async () => {
    const { client } = fakeClient({ updateError: { message: 'nope' } });
    const result = await reviewProductReview(client, { admin, reviewId: 'rev-1', action: 'approve' });
    expect(result).toEqual({ status: 'failure' });
  });
});
