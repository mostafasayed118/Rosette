/**
 * Paymob webhook helpers. Pure functions that the route delegates to so they
 * can be unit-tested without a real Supabase client.
 */

export function buildPaymobIdempotencyKey(providerReference: string): string {
  return `paymob:${providerReference}`;
}

export type QuarantineInsertResult = { error: { message: string } | null } | Promise<{ error: { message: string } | null }> | { then: (onFulfilled: (value: { error: { message: string } | null }) => unknown) => unknown };

export type SupabaseLike = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => QuarantineInsertResult;
  };
};

export type QuarantineInput = {
  client: SupabaseLike;
  provider: string;
  providerReference: string;
  orderReference: string;
  orderTotalMinor: number;
  callbackAmountMinor: number;
  payload: Record<string, unknown>;
};

export type QuarantineResult = { quarantined: true; status: 200 } | { quarantined: false; status: 500; reason: string };

export async function handlePaymobAmountMismatch(input: QuarantineInput): Promise<QuarantineResult> {
  const errorMessage = `amount_mismatch: order=${input.orderTotalMinor} callback=${input.callbackAmountMinor}`;
  const result = await Promise.resolve(input.client.from('webhook_quarantine').insert({
    provider: input.provider,
    provider_reference: input.providerReference,
    payload: input.payload,
    error_message: errorMessage,
  }));
  if (result.error) {
    return { quarantined: false, status: 500, reason: `webhook_quarantine insert failed: ${result.error.message}` };
  }
  return { quarantined: true, status: 200 };
}
