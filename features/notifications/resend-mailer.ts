import { getOptionalServerEnv } from '@/lib/server-env';
import { logger } from '@/lib/logger';
import { renderOrderEmail } from './email-templates';
import type { OrderNotificationInput } from './email-types';

/**
 * Resend mailer - FREE 3k emails/month.
 * Replaces Gmail SMTP (500/day limit + spam risk).
 * Better deliverability, supports React Email templates + HTML/text fallback.
 * Docs: https://resend.com/docs
 *
 * Cloudflare Workers cannot open raw TCP/TLS sockets, so SMTP is unsupported on
 * the deploy target. Every transactional email goes through the Resend HTTP API
 * via `fetch` — the ONLY supported transport.
 */

/**
 * Structural mail-transport contract. Tests inject a fake implementing
 * `sendMail`; production code never uses this and routes through Resend.
 */
export type MailTransport = {
  sendMail: (message: { from: string; to: string; subject: string; text: string; html: string; headers?: Record<string, string> }) => Promise<unknown>;
};

/**
 * Generic Resend sender — the single transport for ALL transactional email.
 * Uses the Resend HTTP API directly (no SMTP). Returns
 * `{ accepted: false }` (never throws) when the key/from is missing or the
 * request fails, so callers can treat email as best-effort.
 */
export async function sendEmailResend(input: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  locale?: string;
  text?: string;
  headers?: Record<string, string>;
}): Promise<{ accepted: boolean }> {
  const key = getOptionalServerEnv('RESEND_API_KEY');
  if (!key) {
    logger.warn('notification.resend_no_key', { to: input.to, locale: input.locale });
    return { accepted: false };
  }
  const from = input.from ?? getOptionalServerEnv('RESEND_FROM');
  if (!from) {
    logger.warn('notification.resend_no_from', { to: input.to, locale: input.locale });
    return { accepted: false };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.headers ? { headers: input.headers } : {}),
      }),
    });
    if (!res.ok) {
      logger.warn('notification.resend_http_error', { status: res.status, to: input.to, locale: input.locale });
      return { accepted: false };
    }
    return { accepted: true };
  } catch (error) {
    logger.warn('notification.resend_error', { error, to: input.to, locale: input.locale });
    return { accepted: false };
  }
}

export async function sendOrderEmailResend(input: OrderNotificationInput) {
  if (!input.recipientEmail) throw new Error('recipientEmail missing');
  const email = renderOrderEmail(input);
  const result = await sendEmailResend({
    to: input.recipientEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    locale: input.locale,
    headers: { 'X-Rosette-Order': input.orderNumber },
  });
  if (!result.accepted) throw new Error('Resend order email was not accepted');
  return { id: undefined, accepted: true };
}
