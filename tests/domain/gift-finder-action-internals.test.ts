import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeGiftFinderFor } from '@/features/gift-finder/action-internals';
import type { QuizAnswers } from '@/features/gift-finder/types';
import type { Product } from '@/features/catalog/types';

const product: Product = {
  slug: 'red-rose', name: 'Red Rose', description: '', category: 'hand-bouquet', occasions: ['love'],
  price: 14000, tone: '#c2185b', imageUrl: null, inventory: 5, delivery: 'Next-day', createdAt: '2026-01-01', variants: [], addOns: [],
  giftRecipients: ['partner'], giftStyles: ['romantic'], giftColors: ['red'], rating: { average: 4, count: 1 },
};

// The action scores with default minResults 3, so the repo must return at least
// three qualifying products for the happy path (the real catalog has 16).
function matchingProducts(count: number): Product[] {
  const rows: Product[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({ ...product, slug: `red-rose-${i}`, name: `Red Rose ${i}`, createdAt: `2026-01-0${i + 1}` });
  }
  return rows;
}

const catalogRepo = {
  list: vi.fn(async () => ({ products: matchingProducts(3), total: 3, query: {}, page: 1, perPage: 1, totalPages: 3 })),
  getBySlug: vi.fn(),
  isDeliverable: vi.fn(),
};

function makeClient(over: Record<string, unknown> = {}) {
  const inserted = vi.fn();
  const client = {
    from: () => ({
      insert: () => ({ select: () => ({ single: () => ({ data: { id: 'c1' }, error: null }) }) }),
    }),
  };
  return { client, inserted };
}

const validAnswers: QuizAnswers = { recipient: 'partner', occasion: 'love', budget: '150-250', color: 'red', style: 'romantic' };

describe('completeGiftFinderFor', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.resetAllMocks(); });

  it('returns ok with scored results', async () => {
    const { client } = makeClient();
    const outcome = await completeGiftFinderFor({ answers: validAnswers, sessionId: 's1', customer: null, catalogRepo: catalogRepo as any, client });
    expect(outcome.status).toBe('ok');
    if (outcome.status === 'ok') {
      expect(outcome.results[0]?.product.slug).toBe('red-rose-0');
      expect(outcome.results[0]?.reasons).toContain('recipient');
    }
  });

  it('stores the completion with the session id and result slugs', async () => {
    const inserted = vi.fn();
    const client = { from: (table: string) => ({ insert: (row: unknown) => { if (table === 'quiz_completions') inserted(row); return { select: () => ({ single: () => ({ data: { id: 'c1' }, error: null }) }) }; }, }) };
    await completeGiftFinderFor({ answers: validAnswers, sessionId: 'session-abc', customer: { id: 'u1', email: 'a@b.c', displayName: 'A', phone: '' }, catalogRepo: catalogRepo as any, client });
    expect(inserted).toHaveBeenCalledTimes(1);
    const row = inserted.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.session_id).toBe('session-abc');
    expect(row.profile_id).toBe('u1');
    expect(row.recipient).toBe('partner');
    expect(row.result_slugs).toContain('red-rose-0');
  });

  it('returns invalid for malformed answers', async () => {
    const { client } = makeClient();
    const outcome = await completeGiftFinderFor({ answers: { recipient: 'partner' } as any, sessionId: 's1', customer: null, catalogRepo: catalogRepo as any, client });
    expect(outcome).toBe('invalid');
  });

  it('does not throw when the completion insert fails', async () => {
    // insertQuizCompletion reads { error } off the insert() result directly —
    // returning an error at the top level exercises the best-effort path.
    const client = { from: () => ({ insert: () => ({ error: new Error('boom') }) }) };
    const outcome = await completeGiftFinderFor({ answers: validAnswers, sessionId: 's1', customer: null, catalogRepo: catalogRepo as any, client });
    expect(outcome.status).toBe('ok');
  });
});
