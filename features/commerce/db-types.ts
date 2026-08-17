import type { FulfillmentStatus, PaymentStatus } from './order-state';

export type MoneyMinor = number;
export type OrderState = { paymentStatus: PaymentStatus; fulfillmentStatus: FulfillmentStatus };

export type ProductRow = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  category: string;
  occasions: string[];
  price_minor: MoneyMinor;
  tone: string;
  delivery: string;
  active: boolean;
  created_at: string;
};
