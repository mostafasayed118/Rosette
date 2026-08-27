export type QuizAnswers = {
  recipient: string;
  occasion: string;
  budget: string;
  color: string;
  style: string;
};

export type QuizReason = 'recipient' | 'occasion' | 'color' | 'style';

export type ScoredProduct = {
  product: import('@/features/catalog/types').Product;
  reasons: QuizReason[];
};

export type GiftFinderOutcome =
  | { status: 'ok'; results: ScoredProduct[] }
  | { status: 'empty' };
