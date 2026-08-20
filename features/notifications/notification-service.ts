import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';
import { isEmailDeliveryDisabled } from '@/lib/runtime-config';
import { renderOrderEmail } from './email-templates';
import { createMailTransport, type MailTransport } from './gmail-mailer';
import type { OrderNotificationInput } from './email-types';

export async function sendOrderNotification(input: OrderNotificationInput, injectedTransport?: MailTransport) {
  if (!input.recipientEmail) return { accepted: false as const, retryable: false as const };
  if (!injectedTransport && isEmailDeliveryDisabled()) return { accepted: false as const, retryable: false as const, skipped: true as const };
  try {
    const transport = injectedTransport ?? createMailTransport();
    const email = renderOrderEmail(input);
    const from = injectedTransport ? (getOptionalServerEnv('GMAIL_FROM') ?? 'Rosette <no-reply@example.invalid>') : getRequiredServerEnv('GMAIL_FROM');
    await transport.sendMail({ from, to: input.recipientEmail, subject: email.subject, text: email.text, html: email.html });
    return { accepted: true as const };
  } catch {
    return { accepted: false as const, retryable: true as const };
  }
}

export function isEmailConfigured() {
  return Boolean(getOptionalServerEnv('GMAIL_USER') && getOptionalServerEnv('GMAIL_APP_PASSWORD') && getOptionalServerEnv('GMAIL_FROM'));
}
