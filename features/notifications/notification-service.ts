import { getOptionalServerEnv } from '@/lib/server-env';
import { isEmailDeliveryDisabled } from '@/lib/runtime-config';
import { renderOrderEmail } from './email-templates';
import { sendEmailResend, type MailTransport } from './resend-mailer';
import type { OrderNotificationInput } from './email-types';

export async function sendOrderNotification(input: OrderNotificationInput, injectedTransport?: MailTransport) {
  if (!input.recipientEmail) return { accepted: false as const, retryable: false as const };
  if (!injectedTransport && isEmailDeliveryDisabled()) return { accepted: false as const, retryable: false as const, skipped: true as const };
  try {
    if (injectedTransport) {
      const email = renderOrderEmail(input);
      const from = getOptionalServerEnv('GMAIL_FROM') ?? 'Rosette <no-reply@example.invalid>';
      await injectedTransport.sendMail({ from, to: input.recipientEmail, subject: email.subject, text: email.text, html: email.html });
      return { accepted: true as const };
    }
    const email = renderOrderEmail(input);
    const result = await sendEmailResend({
      to: input.recipientEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      locale: input.locale,
    });
    return result.accepted ? { accepted: true as const } : { accepted: false as const, retryable: true as const };
  } catch {
    return { accepted: false as const, retryable: true as const };
  }
}

export function isEmailConfigured() {
  // Resend is the only supported transport on Cloudflare Workers (no SMTP).
  return Boolean(getOptionalServerEnv('RESEND_API_KEY') && getOptionalServerEnv('RESEND_FROM'));
}
