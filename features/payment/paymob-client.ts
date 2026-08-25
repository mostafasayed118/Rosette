import { getRequiredServerEnv } from '@/lib/server-env';

export type PaymentCustomer = { name: string; email: string; phone: string };
export type CreatePaymentInput = { amountMinor: number; orderReference: string; specialReference?: string; integrationId: number; customer: PaymentCustomer; notificationUrl: string; redirectionUrl: string };
export type PaymobIntentionResponse = { id: string; client_secret: string; intention_order_id?: number; special_reference?: string };

export function buildPaymobIntentionPayload(input: CreatePaymentInput) {
  return {
    amount: input.amountMinor,
    currency: 'EGP',
    payment_methods: [input.integrationId],
    items: [{ name: input.orderReference, amount: input.amountMinor, description: `Rosette order ${input.orderReference}`, quantity: 1 }],
    billing_data: {
      first_name: input.customer.name,
      last_name: 'Customer',
      email: input.customer.email,
      phone_number: input.customer.phone,
      apartment: 'NA',
      floor: 'NA',
      street: 'NA',
      building: 'NA',
      postal_code: 'NA',
      city: 'Cairo',
      state: 'Cairo',
      country: 'EG',
    },
    special_reference: input.specialReference ?? input.orderReference,
    notification_url: input.notificationUrl,
    redirection_url: input.redirectionUrl,
  };
}

export async function createPaymobIntention(input: CreatePaymentInput): Promise<{ providerReference: string; checkoutUrl: string }> {
  const baseUrl = getRequiredServerEnv('PAYMOB_BASE_URL').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/v1/intention`, {
    method: 'POST',
    headers: { Authorization: `Token ${getRequiredServerEnv('PAYMOB_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPaymobIntentionPayload(input)),
    // A hung Paymob must not pin a Worker isolate. 10s is generous; Paymob
    // typically responds in <2s. The route maps the abort to a 503.
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Paymob intention failed with status ${response.status}`);
  const body = (await response.json()) as PaymobIntentionResponse;
  if (!body.client_secret || !body.id) throw new Error('Paymob returned an incomplete intention');
  const publicKey = getRequiredServerEnv('PAYMOB_PUBLIC_KEY');
  return { providerReference: body.intention_order_id ? String(body.intention_order_id) : body.id, checkoutUrl: `${baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(publicKey)}&clientSecret=${encodeURIComponent(body.client_secret)}` };
}
