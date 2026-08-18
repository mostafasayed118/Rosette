import { describe, expect, it, vi, afterEach } from 'vitest';
import { logRouteError, respond } from '@/lib/api';

afterEach(() => vi.restoreAllMocks());

describe('respond', () => {
  it('maps a matching case to its status and error body', async () => {
    const res = respond('forbidden' as const, { forbidden: { status: 403, error: 'Forbidden' } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('falls through to the ok body when the result has no case', async () => {
    const res = respond<'saved' | 'forbidden'>('saved', { forbidden: { status: 403, error: 'Forbidden' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('honors a custom okStatus and non-default ok body', async () => {
    const res = respond('created' as const, {}, { ok: true, id: '1' }, 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, id: '1' });
  });
});

describe('logRouteError', () => {
  it('logs the scope and the error message for Error instances', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logRouteError('order creation', new Error('boom'));
    expect(spy).toHaveBeenCalledWith('order creation error', 'boom');
  });

  it('logs "unknown" for non-Error throwables', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logRouteError('order creation', 'nope');
    expect(spy).toHaveBeenCalledWith('order creation error', 'unknown');
  });
});
