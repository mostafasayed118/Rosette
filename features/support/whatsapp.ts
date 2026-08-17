import { getOptionalServerEnv } from '@/lib/server-env';

function normalizeNumber(number: string) {
  return number.replace(/\D/g, '');
}

export function createWhatsAppHref(input: { number: string; locale: 'ar' | 'en'; orderId?: string }): string | null {
  const number = normalizeNumber(input.number);
  if (!number) return null;
  const message = input.locale === 'ar'
    ? `مرحبا روزيت، أحتاج إلى مساعدة${input.orderId ? ` بخصوص الطلب ${input.orderId}` : ''}.`
    : `Hello Rosette, I need help${input.orderId ? ` with order ${input.orderId}.` : '.'}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function getConfiguredWhatsAppHref(input: { locale: 'ar' | 'en'; orderId?: string }) {
  const number = getOptionalServerEnv('WHATSAPP_BUSINESS_NUMBER');
  return number ? createWhatsAppHref({ ...input, number }) : null;
}
