import { escapeHtml } from '@/features/notifications/email-templates';
import { sendEmailResend, type MailTransport } from '@/features/notifications/resend-mailer';
import { getOptionalServerEnv } from '@/lib/server-env';
import { isEmailDeliveryDisabled } from '@/lib/runtime-config';
import { renderEngagementFooter } from '@/features/email-preferences/engagement-footer';
import type { PreferenceLocale } from '@/features/email-preferences/preferences-service';

export type WishlistEmailType = 'wishlist_price_drop' | 'wishlist_back_in_stock';

type EmailLocale = 'en' | 'ar' | 'fr';

const subjects: Record<EmailLocale, Record<WishlistEmailType, string>> = {
  en: { wishlist_price_drop: 'A flower you saved just dropped in price', wishlist_back_in_stock: 'Back in stock: {name}' },
  ar: { wishlist_price_drop: 'زهرة حفظتها انخفض سعرها', wishlist_back_in_stock: 'عاد التوفر: {name}' },
  fr: { wishlist_price_drop: 'Une fleur enregistrée a baissé de prix', wishlist_back_in_stock: 'De retour en stock : {name}' },
};

const copy: Record<EmailLocale, { drop: (name: string, price: string) => string; restock: (name: string) => string; view: string; from: string }> = {
  en: { drop: (name, price) => `The ${name} you saved just dropped in price to ${price}.`, restock: (name) => `Good news — ${name} is back in stock.`, view: 'View product', from: 'Rosette wishlist' },
  ar: { drop: (name, price) => `${name} الذي حفظته انخفض سعره إلى ${price}.`, restock: (name) => `أخبار سعيدة — عاد ${name} متوفراً.`, view: 'عرض المنتج', from: 'قائمة روزيت المفضلة' },
  fr: { drop: (name, price) => `Le produit ${name} que vous avez enregistré vient de baisser à ${price}.`, restock: (name) => `Bonne nouvelle — ${name} est de retour en stock.`, view: 'Voir le produit', from: 'Favoris Rosette' },
};

export function renderWishlistEmail(input: { locale: EmailLocale; type: WishlistEmailType; productName: string; priceMinor?: number; productUrl: string; unsubscribeUrl?: string }) {
  const locale = input.locale;
  const name = input.productName;
  const url = escapeHtml(input.productUrl);
  const money = (minor: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(minor / 100);
  const price = input.priceMinor !== undefined ? money(input.priceMinor) : null;
  const intro = input.type === 'wishlist_price_drop' ? copy[locale].drop(name, price ?? '') : copy[locale].restock(name);
  const subject = subjects[locale][input.type].replace('{name}', name);
  const text = `${subject}\n${intro}\n${input.productUrl}`;
  const footer = input.unsubscribeUrl ? renderEngagementFooter(locale as PreferenceLocale, input.unsubscribeUrl) : { text: '', html: '' };
  const html = `<!doctype html><html lang="${locale}"><body style="font-family:Arial,sans-serif"><h1>${escapeHtml(subject)}</h1><p>${escapeHtml(intro)}</p><p><a href="${url}">${copy[locale].view}</a></p>${footer.html}</body></html>`;
  return { subject, text: `${text}${footer.text}`, html };
}

export async function sendWishlistEmail(
  input: { to: string; locale: EmailLocale; type: WishlistEmailType; productName: string; priceMinor?: number; productUrl: string; unsubscribeUrl?: string },
  injectedTransport?: MailTransport,
): Promise<void> {
  if (!injectedTransport && isEmailDeliveryDisabled()) throw new Error('Email delivery disabled');
  const { subject, text, html } = renderWishlistEmail(input);
  const headers = input.unsubscribeUrl
    ? { 'List-Unsubscribe': `<${input.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : undefined;
  if (injectedTransport) {
    const from = getOptionalServerEnv('GMAIL_FROM') ?? 'Rosette <no-reply@example.invalid>';
    const message: Parameters<MailTransport['sendMail']>[0] = { from, to: input.to, subject, text, html };
    if (headers) message.headers = headers;
    await injectedTransport.sendMail(message);
    return;
  }
  await sendEmailResend({ to: input.to, subject, html, text, locale: input.locale, ...(headers ? { headers } : {}) });
}
