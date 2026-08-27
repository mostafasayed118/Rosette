import { Resend } from 'resend';
import { getOptionalServerEnv } from '@/lib/server-env';
import { renderOrderEmail } from './email-templates';
import type { OrderNotificationInput } from './email-types';

/**
 * Resend mailer - FREE 3k emails/month.
 * Replaces Gmail SMTP (500/day limit + spam risk).
 * Better deliverability, supports React Email templates + HTML/text fallback.
 * Docs: https://resend.com/docs
 *
 * Lazy-init: only construct the Resend client when a send is actually requested
 * with a configured key. This keeps module import side-effect-free for tests
 * and safe on Workers, where env is read at request time, not module load.
 */

let cachedClient: Resend | null = null;
function getClient(): Resend {
  const key = getOptionalServerEnv('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY not configured');
  if (!cachedClient) cachedClient = new Resend(key);
  return cachedClient;
}

export async function sendOrderEmailResend(input: OrderNotificationInput) {
  if (!getOptionalServerEnv('RESEND_API_KEY')) throw new Error('RESEND_API_KEY not configured');
  // Resend rejects unverified senders, so there is no safe default here.
  const from = getOptionalServerEnv('RESEND_FROM');
  if (!from) throw new Error('RESEND_FROM not configured');
  if (!input.recipientEmail) throw new Error('recipientEmail missing');

  const email = renderOrderEmail(input);
  const resend = getClient();

  const { data, error } = await resend.emails.send({
    from,
    to: [input.recipientEmail],
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: { 'X-Rosette-Order': input.orderNumber },
  });

  if (error) throw error;
  return { id: data?.id, accepted: true };
}
