import { describe, expect, it } from 'vitest';
import { AppError, errorResponse, toRouteError, withRoute } from '@/lib/route-errors';

describe('route error taxonomy', () => {
  it('preserves intentional status and code', async () => {
    const response = errorResponse(new AppError('forbidden', 'Forbidden'));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden', code: 'forbidden' });
  });

  it('hides unknown internal error details', () => {
    const error = toRouteError(new Error('database password leaked'));
    expect(error.status).toBe(503);
    expect(error.message).toBe('The service is temporarily unavailable.');
    expect(error.message).not.toContain('password');
  });

  it('wraps route handlers without changing successful responses', async () => {
    const handler = withRoute(async (request: Request) => Response.json({ method: request.method }));
    const response = await handler(new Request('https://example.test', { method: 'POST' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ method: 'POST' });
  });
});
