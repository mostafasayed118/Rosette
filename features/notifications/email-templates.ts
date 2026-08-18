import type { OrderNotificationInput } from './email-types';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

const subjects = {
  en: { order_received: 'Order received', payment_confirmed: 'Payment confirmed', payment_failed: 'Payment failed', preparing: 'Your order is being prepared', out_for_delivery: 'Your order is out for delivery', delivered: 'Your order was delivered' },
  ar: { order_received: 'تم استلام الطلب', payment_confirmed: 'تأكيد الدفع', payment_failed: 'تعذر الدفع', preparing: 'طلبك قيد التجهيز', out_for_delivery: 'طلبك خرج للتوصيل', delivered: 'تم توصيل طلبك' },
  fr: { order_received: 'Commande reçue', payment_confirmed: 'Paiement confirmé', payment_failed: 'Paiement échoué', preparing: 'Votre commande est en préparation', out_for_delivery: 'Votre commande est en cours de livraison', delivered: 'Votre commande a été livrée' },
} as const;

const intlLocales = { en: 'en-EG', ar: 'ar-EG', fr: 'fr-FR' } as const;

export function renderOrderEmail(input: OrderNotificationInput) {
  const isArabic = input.locale === 'ar';
  const isFrench = input.locale === 'fr';
  const order = escapeHtml(input.orderNumber);
  const url = escapeHtml(input.orderUrl);
  const total = new Intl.NumberFormat(intlLocales[input.locale], { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(input.totalMinor / 100);
  const discount = input.discountMinor ? new Intl.NumberFormat(intlLocales[input.locale], { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(input.discountMinor / 100) : null;
  const discountLine = discount ? (isArabic ? ` الخصم −${escapeHtml(discount)}` : isFrench ? ` Remise −${escapeHtml(discount)}` : ` Discount −${escapeHtml(discount)}`) : '';
  const title = isArabic ? 'تحديث طلبك' : isFrench ? 'Mise à jour de votre commande' : 'Your order update';
  const body = isArabic ? `رقم طلبك هو ${order}. إجمالي الطلب ${escapeHtml(total)}.${discountLine}` : isFrench ? `Votre numéro de commande est ${order}. Le total de la commande est ${escapeHtml(total)}.${discountLine}` : `Your order number is ${order}. The order total is ${escapeHtml(total)}.${discountLine}`;
  const link = isArabic ? 'عرض الطلب' : isFrench ? 'Voir la commande' : 'View order';
  const direction = isArabic ? 'rtl' : 'ltr';
  return {
    subject: subjects[input.locale][input.type],
    text: `${title}\n${body}\n${input.orderUrl}`,
    html: `<!doctype html><html lang="${input.locale}" dir="${direction}"><body style="font-family:Arial,sans-serif;text-align:${isArabic ? 'right' : 'left'}"><h1>${title}</h1><p>${body}</p><p><a href="${url}">${link}</a></p></body></html>`,
  };
}
