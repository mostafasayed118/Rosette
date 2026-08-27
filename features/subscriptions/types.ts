export type Frequency = 'weekly' | 'biweekly' | 'monthly';
export type SubscriptionStatus = 'pending_payment' | 'active' | 'paused' | 'completed' | 'cancelled';
export type PlanPrices = Array<{ deliveries: number; priceMinor: number }>;
export type Plan = {
  id: string; slug: string; nameEn: string; nameAr: string; nameFr: string;
  descriptionEn: string; descriptionAr: string; descriptionFr: string;
  frequencies: Frequency[]; bundlePrices: PlanPrices; productId: string; active: boolean; sortOrder: number;
};
