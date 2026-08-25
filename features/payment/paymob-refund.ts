import { getRequiredServerEnv } from '@/lib/server-env';

export type PaymobRefundResult =
  | { ok: true; refundTransactionId: string }
  | { ok: false; error: string };

export async function createPaymobAuthToken(): Promise<string> {
  const baseUrl = getRequiredServerEnv('PAYMOB_BASE_URL').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/auth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: getRequiredServerEnv('PAYMOB_API_KEY') }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Paymob auth failed with status ${response.status}`);
  const body = (await response.json()) as { token?: string };
  if (!body.token) throw new Error('Paymob returned no auth token');
  return body.token;
}

/**
 * Full refund of a successful Paymob transaction. Never throws — callers
 * (the cancellation approval flow) treat a non-ok result as "block the
 * approval", so state never claims a refund that did not happen.
 */
export async function refundPaymobTransaction(input: { transactionId: string; amountMinor: number }): Promise<PaymobRefundResult> {
  try {
    const authToken = await createPaymobAuthToken();
    const baseUrl = getRequiredServerEnv('PAYMOB_BASE_URL').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/api/acceptance/void_refund/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_token: authToken, transaction_id: Number(input.transactionId), amount_cents: input.amountMinor }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { ok: false, error: `Paymob refund failed with status ${response.status}` };
    const body = (await response.json()) as { id?: number | string };
    if (body.id === undefined || body.id === null) return { ok: false, error: 'Paymob returned an incomplete refund' };
    return { ok: true, refundTransactionId: String(body.id) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Paymob refund call failed' };
  }
}
