import { escapeHtml } from '@/features/notifications/email-templates';
import { createGmailTransport, type MailTransport } from '@/features/notifications/gmail-mailer';
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';
import type { EmailLocale } from '@/features/notifications/email-types';

export type GiftCardEmailInput = {
  locale: EmailLocale;
  recipientName: string;
  buyerName: string;
  message: string;
  amountMinor: number;
  code: string;
  expiresAt: string;
  recipientCopy: boolean;
};

const copy = {
  en: { subject: 'Your digital gift card', heading: 'A little Rosette joy', intro: (name: string) => `Dear ${name},`, amount: 'Gift-card value', expiry: 'Valid until', code: 'Your code', message: 'A message for you', instructions: 'Use this code at checkout on Rosette.' },
  ar: { subject: 'بطاقة هدية رقمية', heading: 'فرحة صغيرة من روزيت', intro: (name: string) => `عزيزتي ${name}،`, amount: 'قيمة بطاقة الهدية', expiry: 'صالحة حتى', code: 'رمزك', message: 'رسالة لك', instructions: 'استخدمي هذا الرمز عند الدفع على روزيت.' },
  fr: { subject: 'Votre carte cadeau numérique', heading: 'Une petite joie Rosette', intro: (name: string) => `Bonjour ${name},`, amount: 'Valeur de la carte', expiry: 'Valable jusqu’au', code: 'Votre code', message: 'Un message pour vous', instructions: 'Utilisez ce code au paiement sur Rosette.' },
} as const;

const localeMap = { en: 'en-EG', ar: 'ar-EG', fr: 'fr-FR' } as const;

export function renderGiftCardEmail(input: GiftCardEmailInput) {
  const c = copy[input.locale];
  const money = new Intl.NumberFormat(localeMap[input.locale], { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(input.amountMinor / 100);
  const direction = input.locale === 'ar' ? 'rtl' : 'ltr';
  const name = escapeHtml(input.recipientName);
  const message = escapeHtml(input.message);
  const code = escapeHtml(input.code);
  const expiry = escapeHtml(new Intl.DateTimeFormat(localeMap[input.locale], { dateStyle: 'long' }).format(new Date(input.expiresAt)));
  const text = `${c.subject}\n${c.intro(input.recipientName)}\n${c.amount}: ${money}\n${c.expiry}: ${expiry}\n${c.code}: ${input.code}\n${input.message ? `${c.message}: ${input.message}\n` : ''}${c.instructions}`;
  const html = `<!doctype html><html lang="${input.locale}" dir="${direction}"><body style="font-family:Arial,sans-serif;text-align:${direction === 'rtl' ? 'right' : 'left'}"><h1>${c.heading}</h1><p>${c.intro(name)}</p><p><strong>${c.amount}: ${money}</strong></p><p>${c.expiry}: ${expiry}</p><p><strong>${c.code}: ${code}</strong></p>${message ? `<p>${c.message}: ${message}</p>` : ''}<p>${c.instructions}</p></body></html>`;
  return { subject: c.subject, text, html };
}

export async function sendGiftCardEmail(input: { recipient: string; rendered: ReturnType<typeof renderGiftCardEmail> }, injectedTransport?: MailTransport) {
  try {
    const transport = injectedTransport ?? createGmailTransport();
    const from = injectedTransport ? (getOptionalServerEnv('GMAIL_FROM') ?? 'Rosette <no-reply@example.invalid>') : getRequiredServerEnv('GMAIL_FROM');
    await transport.sendMail({ from, to: input.recipient, subject: input.rendered.subject, text: input.rendered.text, html: input.rendered.html });
    return true;
  } catch {
    return false;
  }
}

type DeliveryInput = Omit<GiftCardEmailInput, 'recipientCopy'> & { buyerEmail: string; recipientEmail: string };
type SendGiftCardEmail = (input: { recipient: string; rendered: ReturnType<typeof renderGiftCardEmail> }) => Promise<boolean>;

export async function deliverGiftCardPurchase(input: { purchase: DeliveryInput; send: SendGiftCardEmail }): Promise<{ sent: number; failed: number }> {
  const recipients = [...new Set([input.purchase.buyerEmail.trim().toLowerCase(), input.purchase.recipientEmail.trim().toLowerCase()])].filter(Boolean);
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    const accepted = await input.send({ recipient, rendered: renderGiftCardEmail({ ...input.purchase, recipientCopy: recipient === input.purchase.recipientEmail }) });
    if (accepted) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}
