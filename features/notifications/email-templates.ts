import type { OrderNotificationInput } from './email-types';

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

const subjects = {
  en: { order_received: 'Order received', payment_confirmed: 'Payment confirmed', payment_failed: 'Payment failed', preparing: 'Your order is being prepared', ready_for_delivery: 'Your order is ready for delivery', out_for_delivery: 'Your order is out for delivery', delivered: 'Your order was delivered', cancel_approved: 'Your cancellation was confirmed', cancel_rejected: 'Cancellation request declined', change_approved: 'Your change request was approved', change_payment_required: 'Pay the difference for your order', change_rejected: 'Change request declined' },
  ar: { order_received: 'تم استلام الطلب', payment_confirmed: 'تأكيد الدفع', payment_failed: 'تعذر الدفع', preparing: 'طلبك قيد التجهيز', ready_for_delivery: 'طلبك جاهز للتوصيل', out_for_delivery: 'طلبك خرج للتوصيل', delivered: 'تم توصيل طلبك', cancel_approved: 'تم تأكيد إلغاء طلبك', cancel_rejected: 'تم رفض طلب الإلغاء', change_approved: 'تمت الموافقة على طلب التعديل', change_payment_required: 'ادفع فرق السعر لطلبك', change_rejected: 'تم رفض طلب التعديل' },
  fr: { order_received: 'Commande reçue', payment_confirmed: 'Paiement confirmé', payment_failed: 'Paiement échoué', preparing: 'Votre commande est en préparation', ready_for_delivery: 'Votre commande est prête pour la livraison', out_for_delivery: 'Votre commande est en cours de livraison', delivered: 'Votre commande a été livrée', cancel_approved: 'Votre annulation a été confirmée', cancel_rejected: 'Demande d’annulation refusée', change_approved: 'Votre demande de modification a été approuvée', change_payment_required: 'Payez la différence pour votre commande', change_rejected: 'Demande de modification refusée' },
} as const;

const intlLocales = { en: 'en-EG', ar: 'ar-EG', fr: 'fr-FR' } as const;

const copy = {
  en: { title: 'Your order update', intro: (order: string) => `Your order number is ${order}.`, subtotal: 'Subtotal', delivery: 'Delivery', discount: 'Discount', total: 'Total', view: 'View order' },
  ar: { title: 'تحديث طلبك', intro: (order: string) => `رقم طلبك هو ${order}.`, subtotal: 'المجموع الفرعي', delivery: 'التوصيل', discount: 'الخصم', total: 'الإجمالي', view: 'عرض الطلب' },
  fr: { title: 'Mise à jour de votre commande', intro: (order: string) => `Votre numéro de commande est ${order}.`, subtotal: 'Sous-total', delivery: 'Livraison', discount: 'Remise', total: 'Total', view: 'Voir la commande' },
} as const;

export function renderOrderEmail(input: OrderNotificationInput) {
  const isArabic = input.locale === 'ar';
  const money = (minor: number) => new Intl.NumberFormat(intlLocales[input.locale], { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(minor / 100);
  const c = copy[input.locale];
  const order = escapeHtml(input.orderNumber);
  const url = escapeHtml(input.orderUrl);
  const direction = isArabic ? 'rtl' : 'ltr';

  const hasBreakdown = input.subtotalMinor !== undefined && input.deliveryFeeMinor !== undefined;
  const lines: string[] = [];
  if (hasBreakdown) {
    lines.push(`${c.subtotal}: ${money(input.subtotalMinor!)}`);
    lines.push(`${c.delivery}: ${money(input.deliveryFeeMinor!)}`);
    if (input.discountMinor) lines.push(`${c.discount}: −${money(input.discountMinor)}`);
    lines.push(`${c.total}: ${money(input.totalMinor)}`);
  } else {
    const discountSuffix = input.discountMinor ? ` · ${c.discount} −${money(input.discountMinor)}` : '';
    lines.push(`${c.total}: ${money(input.totalMinor)}${discountSuffix}`);
  }

  const intro = c.intro(order);
  const text = `${c.title}\n${intro}\n${lines.join('\n')}\n${input.orderUrl}`;
  const htmlLines = lines.map((line) => `<li>${line}</li>`).join('');
  const html = `<!doctype html><html lang="${input.locale}" dir="${direction}"><body style="font-family:Arial,sans-serif;text-align:${isArabic ? 'right' : 'left'}"><h1>${c.title}</h1><p>${intro}</p><ul>${htmlLines}</ul><p><a href="${url}">${c.view}</a></p></body></html>`;

  return { subject: subjects[input.locale][input.type], text, html };
}
