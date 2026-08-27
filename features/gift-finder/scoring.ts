import type { Product } from '@/features/catalog/types';
import { answersToBudgetBand } from './tags';
import type { QuizAnswers, QuizReason, ScoredProduct } from './types';

export function buildReasons(product: Product, answers: QuizAnswers): QuizReason[] {
  const reasons: QuizReason[] = [];
  if ((product.giftRecipients ?? []).includes(answers.recipient)) reasons.push('recipient');
  if (answers.occasion !== 'just-because' && product.occasions.includes(answers.occasion)) reasons.push('occasion');
  if ((product.giftColors ?? []).includes(answers.color)) reasons.push('color');
  if ((product.giftStyles ?? []).includes(answers.style)) reasons.push('style');
  return reasons;
}

type Scored = { product: Product; score: number; reasons: QuizReason[] };

function weight(reason: QuizReason): number {
  switch (reason) {
    case 'recipient': return 3;
    case 'occasion': return 3;
    case 'color': return 2;
    case 'style': return 2;
  }
}

function inBand(product: Product, minMinor?: number, maxMinor?: number): boolean {
  if (minMinor !== undefined && product.price < minMinor) return false;
  if (maxMinor !== undefined && product.price > maxMinor) return false;
  return true;
}

function rank(a: Scored, b: Scored): number {
  if (b.score !== a.score) return b.score - a.score;
  const ar = a.product.rating?.average ?? 0;
  const br = b.product.rating?.average ?? 0;
  if (br !== ar) return br - ar;
  return (a.product.createdAt ?? '').localeCompare(b.product.createdAt ?? '');
}

export function scoreProducts(products: Product[], answers: QuizAnswers, opts: { top?: number; minResults?: number } = {}): ScoredProduct[] {
  const top = opts.top ?? 6;
  const minResults = opts.minResults ?? 3;
  const band = answersToBudgetBand(answers);

  const inStock = products.filter((p) => p.inventory > 0);

  // Fallback ladder: try the strictest rung first and relax only enough to
  // reach the minimum result count. Each rung computes its own pool.
  const ladder: Array<{ useColors: boolean; useStyles: boolean; minMinor?: number; maxMinor?: number }> = [
    { useColors: true, useStyles: true, minMinor: band.minMinor, maxMinor: band.maxMinor },
    { useColors: true, useStyles: false, minMinor: band.minMinor, maxMinor: band.maxMinor },
    { useColors: false, useStyles: false, minMinor: band.minMinor, maxMinor: band.maxMinor },
  ];
  if (band.minMinor !== undefined) ladder.push({ useColors: false, useStyles: false, minMinor: undefined, maxMinor: band.maxMinor });
  if (band.maxMinor !== undefined) ladder.push({ useColors: false, useStyles: false, minMinor: band.minMinor, maxMinor: undefined });

  for (const rung of ladder) {
    const pool = inStock.filter((p) => inBand(p, rung.minMinor, rung.maxMinor));
    const scored = pool
      .map((product) => {
        const reasons: QuizReason[] = [];
        if ((product.giftRecipients ?? []).includes(answers.recipient)) reasons.push('recipient');
        if (answers.occasion !== 'just-because' && product.occasions.includes(answers.occasion)) reasons.push('occasion');
        if (rung.useColors && (product.giftColors ?? []).includes(answers.color)) reasons.push('color');
        if (rung.useStyles && (product.giftStyles ?? []).includes(answers.style)) reasons.push('style');
        return { product, score: reasons.reduce((sum, reason) => sum + weight(reason), 0), reasons };
      })
      .sort(rank);
    if (scored.length >= minResults) {
      return scored.slice(0, top).map(({ product, reasons }) => ({ product, reasons }));
    }
  }
  // Exhausted the ladder without reaching the minimum — give up gracefully.
  // Fully widen the budget and keep only the always-safe reasons so ranking
  // still works (Scored carries score). If even this is below minResults,
  // return empty so the action surfaces the "no perfect match" empty state.
  const softened = inStock
    .map((product) => {
      const reasons: QuizReason[] = [];
      if ((product.giftRecipients ?? []).includes(answers.recipient)) reasons.push('recipient');
      if (answers.occasion !== 'just-because' && product.occasions.includes(answers.occasion)) reasons.push('occasion');
      return { product, score: reasons.reduce((sum, reason) => sum + weight(reason), 0), reasons } satisfies Scored;
    })
    .sort(rank);
  if (softened.length < minResults) return [];
  return softened.slice(0, top).map(({ product, reasons }) => ({ product, reasons }));
}
