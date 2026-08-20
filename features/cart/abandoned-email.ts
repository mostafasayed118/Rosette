import { escapeHtml } from '@/features/notifications/email-templates';
import { createGmailTransport, type MailTransport } from '@/features/notifications/gmail-mailer';
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';
import { pickLocalized } from '@/features/i18n/pick';
import { renderEngagementFooter } from '@/features/email-preferences/engagement-footer';
import type { PreferenceLocale } from '@/features/email-preferences/preferences-service';
import type { CartLine } from './types';

type EmailLocale = 'en' | 'ar' | 'fr';

const intlLocales = { en: 'en-EG', ar: 'ar-EG', fr: 'fr-FR' } as const;

const copy: Record<EmailLocale, { subject: string; title: string; subtotal: string; delivery: string; finish: string }> = {
  en: { subject: 'Your Rosette bag is waiting', title: 'Your bag is waiting', subtotal: 'Subtotal', delivery: 'Delivery is calculated at checkout', finish: 'Finish your order' },
  ar: { subject: 'حقيبتك من روزيت بانتظارك', title: 'حقيبتك بانتظارك', subtotal: 'المجموع الفرعي', delivery: 'يُحتسب التوصيل عند الدفع', finish: 'أكمل طلبك' },
  fr: { subject: 'Votre panier Rosette vous attend', title: 'Votre panier vous attend', subtotal: 'Sous-total', delivery: 'La livraison est calculée au paiement', finish: 'Terminer votre commande' },
};

function money(locale: EmailLocale, minor: number) {
  return new Intl.NumberFormat(intlLocales[locale], { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(minor / 100);
}

export function renderAbandonedCartEmail(input: { locale: EmailLocale; items: CartLine[]; restoreUrl: string; unsubscribeUrl?: string }) {
  const { locale } = input;
  const isArabic = locale === 'ar';
  const c = copy[locale];
  const url = escapeHtml(input.restoreUrl);
  const rows = input.items.map((line) => ({
    name: escapeHtml(pickLocalized(locale, { en: line.productName, ar: line.productNameAr, fr: line.productNameFr }) || line.productSlug),
    quantity: line.quantity,
    total: line.unitPrice * line.quantity,
  }));
  const subtotal = rows.reduce((sum, row) => sum + row.total, 0);
  const text = `${c.title}\n${rows.map((row) => `${row.name} × ${row.quantity} — ${money(locale, row.total)}`).join('\n')}\n${c.subtotal}: ${money(locale, subtotal)}\n${c.delivery}\n${input.restoreUrl}`;
  const htmlRows = rows.map((row) => `<li>${row.name} × ${row.quantity} — ${money(locale, row.total)}</li>`).join('');
  const footer = input.unsubscribeUrl ? renderEngagementFooter(locale as PreferenceLocale, input.unsubscribeUrl) : { text: '', html: '' };
  const html = `<!doctype html><html lang="${locale}" dir="${isArabic ? 'rtl' : 'ltr'}"><body style="font-family:Arial,sans-serif;text-align:${isArabic ? 'right' : 'left'}"><h1>${c.title}</h1><ul>${htmlRows}</ul><p>${c.subtotal}: ${money(locale, subtotal)}</p><p>${c.delivery}</p><p><a href="${url}">${c.finish}</a></p>${footer.html}</body></html>`;
  return { subject: c.subject, text: `${text}${footer.text}`, html };
}

export async function sendAbandonedCartEmail(
  input: { to: string; locale: EmailLocale; items: CartLine[]; restoreUrl: string; unsubscribeUrl?: string },
  injectedTransport?: MailTransport,
): Promise<void> {
  const { subject, text, html } = renderAbandonedCartEmail(input);
  const transport = injectedTransport ?? createGmailTransport();
  const from = injectedTransport ? (getOptionalServerEnv('GMAIL_FROM') ?? 'Rosette <no-reply@rosette.example>') : getRequiredServerEnv('GMAIL_FROM');
  await transport.sendMail({
    from,
    to: input.to,
    subject,
    text,
    html,
    ...(input.unsubscribeUrl ? { headers: { 'List-Unsubscribe': `<${input.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
  });
}
