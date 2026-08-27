import type { QuizAnswers } from './types';

export const GIFT_RECIPIENTS = ['partner', 'family', 'friend', 'colleague'] as const;
export const GIFT_STYLES = ['romantic', 'classic', 'bold', 'minimal', 'playful'] as const;
export const GIFT_COLORS = ['red', 'pink', 'white', 'pastel', 'bright', 'mixed'] as const;

export type BudgetBand = { id: string; minMinor?: number; maxMinor?: number };

export const BUDGET_BANDS: readonly BudgetBand[] = [
  { id: 'under-150', maxMinor: 15000 },
  { id: '150-250', minMinor: 15000, maxMinor: 25000 },
  { id: 'over-250', minMinor: 25000 },
] as const;

export function answersToBudgetBand(answers: QuizAnswers): BudgetBand {
  return BUDGET_BANDS.find((band) => band.id === answers.budget) ?? BUDGET_BANDS[BUDGET_BANDS.length - 1]!;
}
