/**
 * Server-side Cloudflare Turnstile verification.
 * Free: 1M validations/month on Cloudflare free plan.
 * Docs: https://developers.cloudflare.com/turnstile/
 */
export async function verifyTurnstileToken(token: string, secretKey: string, remoteIp?: string): Promise<{ success: boolean; errorCodes?: string[] }> {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: secretKey, response: token, remoteip: remoteIp }),
  });
  const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
  return { success: data.success, errorCodes: data['error-codes'] };
}

export type TurnstileCheck = 'pass' | 'missing' | 'invalid';

/**
 * Enforcement gate for request handlers: verification only runs when a secret
 * is configured, so deployments without Turnstile keep working unchanged.
 * The widget and this gate are paired through TURNSTILE_SECRET_KEY /
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY — set both or neither.
 */
export async function checkTurnstileToken(token: unknown, secret: string | undefined, remoteIp?: string): Promise<TurnstileCheck> {
  if (!secret) return 'pass';
  if (typeof token !== 'string' || !token) return 'missing';
  const result = await verifyTurnstileToken(token, secret, remoteIp);
  return result.success ? 'pass' : 'invalid';
}
