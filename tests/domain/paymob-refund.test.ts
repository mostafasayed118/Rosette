import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refundPaymobTransaction } from '@/features/payment/paymob-refund';

const API_KEY = 'test-api-key';
const BASE_URL = 'https://accept.paymob.com';

beforeEach(() => {
  vi.stubEnv('PAYMOB_API_KEY', API_KEY);
  vi.stubEnv('PAYMOB_BASE_URL', BASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('refundPaymobTransaction', () => {
  it('authenticates with the API key and refunds the transaction', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'auth-123' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 987654, is_refund: true }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await refundPaymobTransaction({ transactionId: '123456', amountMinor: 10000 });

    expect(result).toEqual({ ok: true, refundTransactionId: '987654' });
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${BASE_URL}/api/auth/tokens`, expect.objectContaining({ body: JSON.stringify({ api_key: API_KEY }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${BASE_URL}/api/acceptance/void_refund/refund`, expect.objectContaining({ body: JSON.stringify({ auth_token: 'auth-123', transaction_id: 123456, amount_cents: 10000 }) }));
  });

  it('returns a failure when the refund endpoint responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'auth-123' }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ detail: 'Amount is required' }) }));

    const result = await refundPaymobTransaction({ transactionId: '123456', amountMinor: 10000 });

    expect(result).toEqual({ ok: false, error: expect.stringContaining('400') });
  });

  it('returns a failure when the refund response is missing an id', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'auth-123' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ is_refund: true }) }));

    const result = await refundPaymobTransaction({ transactionId: '123456', amountMinor: 10000 });

    expect(result).toEqual({ ok: false, error: expect.stringContaining('incomplete') });
  });

  it('returns a failure when authentication fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 401 }));

    const result = await refundPaymobTransaction({ transactionId: '123456', amountMinor: 10000 });

    expect(result).toEqual({ ok: false, error: expect.stringContaining('401') });
  });
});
