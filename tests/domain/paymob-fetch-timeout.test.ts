import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const env = {
  PAYMOB_BASE_URL: 'https://paymob.example',
  PAYMOB_API_KEY: 'sk_test_x',
  PAYMOB_PUBLIC_KEY: 'pk_test_x',
  PAYMOB_INTEGRATION_ID: '1234',
  PAYMOB_HMAC_SECRET: 'hmac',
  GIFT_CARD_SECRET: 'gift',
};

vi.mock('@/lib/server-env', () => ({ getRequiredServerEnv: (key: string) => env[key as keyof typeof env] ?? 'x' }));

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Paymob client fetch timeouts', () => {
  it('createPaymobIntention passes an AbortSignal.timeout to the Paymob fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'pi_1', client_secret: 'cs_1', intention_order_id: 7 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { createPaymobIntention } = await import('@/features/payment/paymob-client');
    await createPaymobIntention({
      amountMinor: 11500,
      orderReference: 'RO-1',
      integrationId: 1234,
      customer: { email: 'a@b.c', phone: '+20100', name: 'Buyer' },
      notificationUrl: 'https://shop.example/api/webhooks/paymob',
      redirectionUrl: 'https://shop.example/orders/o1',
    });
    const call = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(call.signal).toBeInstanceOf(AbortSignal);
    expect((call.signal as AbortSignal).aborted).toBe(false);
  });

  it('createPaymobAuthToken passes an AbortSignal.timeout to the Paymob auth fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'tok' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { createPaymobAuthToken } = await import('@/features/payment/paymob-refund');
    await createPaymobAuthToken();
    const call = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(call.signal).toBeInstanceOf(AbortSignal);
  });

  it('refundPaymobTransaction passes an AbortSignal.timeout to the Paymob refund fetch', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'tok' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 99 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { refundPaymobTransaction } = await import('@/features/payment/paymob-refund');
    await refundPaymobTransaction({ transactionId: '12345', amountMinor: 11500 });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    const refundCallIndex = urls.findIndex((u) => u.includes('void_refund'));
    expect(refundCallIndex, `expected one call to void_refund, got: ${urls.join(', ')}`).toBeGreaterThanOrEqual(0);
    const refundCall = fetchMock.mock.calls[refundCallIndex]?.[1] as RequestInit;
    expect(refundCall?.signal).toBeInstanceOf(AbortSignal);
  });
});
