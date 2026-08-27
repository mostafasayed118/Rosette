import { z } from 'zod';
import type { CatalogRepository, Product } from '@/features/catalog/types';
import { scoreProducts } from './scoring';
import { insertQuizCompletion } from './repository';
import { GIFT_RECIPIENTS, GIFT_STYLES, GIFT_COLORS } from './tags';
import type { GiftFinderOutcome, QuizAnswers } from './types';

type Client = { from: (table: string) => any };
export type Customer = { id: string; email: string; displayName: string; phone: string };

// The repository paginates (CATALOG_PER_PAGE), so scoring must walk every page
// to see the whole catalog — page 1 alone can hide most of the stock.
async function fetchAllProducts(repo: Pick<CatalogRepository, 'list'>): Promise<Product[]> {
  const first = await repo.list({ page: 1 });
  const all = [...first.products];
  for (let page = 2; page <= first.totalPages; page++) {
    const next = await repo.list({ page });
    all.push(...next.products);
  }
  return all;
}

// Spec: the action validates answers with zod, returning 'invalid' on failure.
const quizAnswersSchema = z.object({
  recipient: z.enum(GIFT_RECIPIENTS),
  occasion: z.enum(['birthday', 'love', 'thank-you', 'new-home', 'congratulations', 'sympathy', 'just-because']),
  budget: z.enum(['under-150', '150-250', 'over-250']),
  color: z.enum(GIFT_COLORS),
  style: z.enum(GIFT_STYLES),
});

// Identity and the database client are supplied explicitly by
// features/gift-finder/actions.ts. Never export this as a remote-callable
// server action — every export of a 'use server' module is an endpoint.
export async function completeGiftFinderFor(opts: {
  answers: Record<string, unknown>;
  sessionId: string;
  customer: Customer | null;
  catalogRepo: Pick<CatalogRepository, 'list'>;
  client: Client;
  locale?: string;
}): Promise<GiftFinderOutcome | 'invalid'> {
  const parsed = quizAnswersSchema.safeParse(opts.answers);
  if (!parsed.success) return 'invalid';
  const answers: QuizAnswers = parsed.data;

  const products = await fetchAllProducts(opts.catalogRepo);
  const results = scoreProducts(products, answers);

  await insertQuizCompletion(opts.client, {
    sessionId: opts.sessionId,
    profileId: opts.customer?.id ?? null,
    answers,
    locale: opts.locale ?? 'en',
    resultSlugs: results.map((r) => r.product.slug),
  });

  if (results.length === 0) return { status: 'empty' };
  return { status: 'ok', results };
}
