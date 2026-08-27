import { z } from 'zod';
import type { CatalogRepository } from '@/features/catalog/types';
import { scoreProducts } from './scoring';
import { insertQuizCompletion } from './repository';
import { GIFT_RECIPIENTS, GIFT_STYLES, GIFT_COLORS } from './tags';
import type { GiftFinderOutcome, QuizAnswers } from './types';

type Client = { from: (table: string) => any };
export type Customer = { id: string; email: string; displayName: string; phone: string };

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

  const page = await opts.catalogRepo.list({});
  const results = scoreProducts(page.products, answers);

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
