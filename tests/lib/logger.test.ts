import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger, withRequestContext } from '@/lib/logger';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function spyOnLog() {
  return vi.spyOn(console, 'log').mockImplementation(() => {});
}

function emitted(spy: ReturnType<typeof spyOnLog>, call = 0): Record<string, any> {
  const line = spy.mock.calls[call]![0] as string;
  return JSON.parse(line);
}

describe('logger output shape', () => {
  it('writes a single-line JSON payload with level, event and ts to console.log', () => {
    const spy = spyOnLog();
    logger.info('payment.webhook.received', { orderId: 'RO-1' });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0]![0] as string;
    expect(typeof line).toBe('string');
    expect(line.includes('\n')).toBe(false);
    expect(emitted(spy)).toMatchObject({ level: 'info', event: 'payment.webhook.received', orderId: 'RO-1' });
  });

  it('stamps ts as an ISO-8601 timestamp', () => {
    const spy = spyOnLog();
    logger.info('cron.wishlist.started');
    const { ts } = emitted(spy);
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('routes warn to console.warn with level warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('payment.webhook.invalid_signature', { orderId: 'RO-2' });
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toMatchObject({ level: 'warn', event: 'payment.webhook.invalid_signature', orderId: 'RO-2' });
  });

  it('routes error to console.error with level error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('cron.notifications.failed');
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toMatchObject({ level: 'error', event: 'cron.notifications.failed' });
  });

  it('emits a valid payload when no fields are supplied', () => {
    const spy = spyOnLog();
    logger.info('cron.wishlist.completed');
    expect(emitted(spy)).toEqual({ level: 'info', event: 'cron.wishlist.completed', ts: expect.any(String) });
  });

  it('never lets a field overwrite level, event or ts', () => {
    const spy = spyOnLog();
    logger.info('real.event', { level: 'error', event: 'spoofed', ts: 'nope' } as never);
    expect(emitted(spy)).toMatchObject({ level: 'info', event: 'real.event' });
    expect(emitted(spy).ts).not.toBe('nope');
  });
});

describe('logger secret redaction', () => {
  it('redacts apiKey, hmac, token, password, secret and authorization fields', () => {
    const spy = spyOnLog();
    logger.info('paymob.request', {
      apiKey: 'live-abc',
      hmac: 'deadbeef',
      token: 'tok_123',
      password: 'hunter2',
      clientSecret: 's3cr3t',
      Authorization: 'Token xyz',
      orderId: 'RO-9',
    });
    const payload = emitted(spy);
    expect(payload.apiKey).toBe('[redacted]');
    expect(payload.hmac).toBe('[redacted]');
    expect(payload.token).toBe('[redacted]');
    expect(payload.password).toBe('[redacted]');
    expect(payload.clientSecret).toBe('[redacted]');
    expect(payload.Authorization).toBe('[redacted]');
    expect(payload.orderId).toBe('RO-9');
  });

  it('redacts secret keys nested inside objects and arrays', () => {
    const spy = spyOnLog();
    logger.info('payment.webhook.received', { transaction: { id: 7, hmac: 'abc' }, attempts: [{ authToken: 'zzz', ok: true }] });
    const payload = emitted(spy);
    expect(payload.transaction).toEqual({ id: 7, hmac: '[redacted]' });
    expect(payload.attempts).toEqual([{ authToken: '[redacted]', ok: true }]);
  });

  it('redacts the whole value regardless of its type', () => {
    const spy = spyOnLog();
    logger.info('paymob.request', { PAYMOB_HMAC_SECRET: { nested: 'value' } });
    expect(emitted(spy).PAYMOB_HMAC_SECRET).toBe('[redacted]');
  });
});

describe('logger string truncation', () => {
  it('truncates string fields longer than 500 characters', () => {
    const spy = spyOnLog();
    logger.info('gift-card.issued', { note: 'x'.repeat(600) });
    const { note } = emitted(spy);
    expect(note.startsWith('x'.repeat(500))).toBe(true);
    expect(note).toContain('[truncated]');
    expect(note.length).toBeLessThan(600);
  });

  it('leaves strings at or below 500 characters untouched', () => {
    const spy = spyOnLog();
    const note = 'y'.repeat(500);
    logger.info('gift-card.issued', { note });
    expect(emitted(spy).note).toBe(note);
  });

  it('truncates nested long strings too', () => {
    const spy = spyOnLog();
    logger.info('gift-card.issued', { detail: { body: 'z'.repeat(900) } });
    expect(emitted(spy).detail.body).toContain('[truncated]');
  });
});

describe('logger error serialization', () => {
  it('serializes an Error into name, message and stack outside production', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('cron.wishlist.failed', { error: new TypeError('boom') });
    const { error } = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(error.name).toBe('TypeError');
    expect(error.message).toBe('boom');
    expect(typeof error.stack).toBe('string');
  });

  it('omits the stack when NODE_ENV is production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('cron.wishlist.failed', { error: new Error('boom') });
    const { error } = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(error).toEqual({ name: 'Error', message: 'boom' });
  });

  it('omits the stack when DEPLOYMENT_RUNTIME is cloudflare', () => {
    vi.stubEnv('DEPLOYMENT_RUNTIME', 'cloudflare');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('cron.wishlist.failed', { error: new Error('boom') });
    const { error } = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(error.stack).toBeUndefined();
  });

  it('keeps a non-Error error value as a plain message string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('cron.wishlist.failed', { error: 'nope' });
    expect(JSON.parse(spy.mock.calls[0]![0] as string).error).toEqual({ message: 'nope' });
  });
});

describe('withRequestContext', () => {
  it('attaches the requestId to every emission', () => {
    const spy = spyOnLog();
    const scoped = withRequestContext('req-42');
    scoped.info('payment.webhook.received', { orderId: 'RO-3' });
    expect(emitted(spy)).toMatchObject({ requestId: 'req-42', orderId: 'RO-3', event: 'payment.webhook.received' });
  });

  it('lets explicit fields still redact and route by level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    withRequestContext('req-7').error('payment.webhook.failed', { hmac: 'abc' });
    const payload = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(payload).toMatchObject({ level: 'error', requestId: 'req-7', hmac: '[redacted]' });
  });
});

describe('logger resilience', () => {
  it('does not throw on circular structures', () => {
    const spy = spyOnLog();
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    expect(() => logger.info('cron.notifications.started', { circular })).not.toThrow();
    expect(emitted(spy).circular).toMatchObject({ name: 'loop' });
  });

  it('drops values that JSON cannot represent instead of failing', () => {
    const spy = spyOnLog();
    expect(() => logger.info('cron.notifications.started', { fn: () => 1, sym: Symbol('x'), ok: 1 })).not.toThrow();
    const payload = emitted(spy);
    expect(payload.ok).toBe(1);
    expect(payload.fn).toBeUndefined();
  });
});
