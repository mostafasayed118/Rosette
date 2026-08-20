import { escapeHtml } from '@/features/notifications/email-templates';
import { createGmailTransport, type MailTransport } from '@/features/notifications/gmail-mailer';
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
  const escapedName = escapeHtml(name);
  const url = escapeHtml(input.productUrl);
  const money = (minor: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(minor / 100);
  const price = input.priceMinor !== undefined ? money(input.priceMinor) : null;
  const intro = input.type === 'wishlist_price_drop' ? copy[locale].drop(name, price ?? '') : copy[locale].restock(name);
  const subject = subjects[locale][input.type].replace('{name}', name);
  const text = `${subject}\n${intro}\n${input.productUrl}`;
  const footer = input.unsubscribeUrl ? renderEngagementFooter(locale as PreferenceLocale, input.unsubscribeUrl) : { text: '', html: '' };
  const html = `<!doctype html><html lang="${locale}"><body style="font-family:Arial,sans-serif"><h1>${subjects[locale][input.type]}</h1><p>${escapeHtml(intro)}</p><p><a href="${url}">${copy[locale].view}</a></p>${footer.html}</body></html>`;
  return { subject, text: `${text}${footer.text}`, html };
}

export async function sendWishlistEmail(
  input: { to: string; locale: EmailLocale; type: WishlistEmailType; productName: string; priceMinor?: number; productUrl: string; unsubscribeUrl?: string },
  transport: MailTransport = createGmailTransport(),
): Promise<void> {
  const { subject, text, html } = renderWishlistEmail(input);
  await transport.sendMail({
    from: `Rosette <rosette-wishlist@localhost>`,
    to: input.to,
    subject,
    text,
    html,
    ...(input.unsubscribeUrl ? { headers: { 'List-Unsubscribe': `<${input.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
  });
}
