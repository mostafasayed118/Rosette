import type { OrderNotificationInput } from './email-types';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

const subjects = {
  en: { order_received: 'Order received', payment_confirmed: 'Payment confirmed', payment_failed: 'Payment failed', preparing: 'Your order is being prepared', out_for_delivery: 'Your order is out for delivery', delivered: 'Your order was delivered' },
  ar: { order_received: 'تم استلام الطلب', payment_confirmed: 'تأكيد الدفع', payment_failed: 'تعذر الدفع', preparing: 'طلبك قيد التجهيز', out_for_delivery: 'طلبك خرج للتوصيل', delivered: 'تم توصيل طلبك' },
} as const;

export function renderOrderEmail(input: OrderNotificationInput) {
  const isArabic = input.locale === 'ar';
  const order = escapeHtml(input.orderNumber);
  const url = escapeHtml(input.orderUrl);
  const total = new Intl.NumberFormat(isArabic ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(input.totalMinor / 100);
  const title = isArabic ? 'تحديث طلبك' : 'Your order update';
  const body = isArabic ? `رقم طلبك هو ${order}. إجمالي الطلب ${escapeHtml(total)}.` : `Your order number is ${order}. The order total is ${escapeHtml(total)}.`;
  const link = isArabic ? 'عرض الطلب' : 'View order';
  const direction = isArabic ? 'rtl' : 'ltr';
  return {
    subject: subjects[input.locale][input.type],
    text: `${title}\n${body}\n${input.orderUrl}`,
    html: `<!doctype html><html lang="${input.locale}" dir="${direction}"><body style="font-family:Arial,sans-serif;text-align:${isArabic ? 'right' : 'left'}"><h1>${title}</h1><p>${body}</p><p><a href="${url}">${link}</a></p></body></html>`,
  };
}
