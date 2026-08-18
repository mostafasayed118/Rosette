import { getOptionalServerEnv } from '@/lib/server-env';

function normalizeNumber(number: string) {
  return number.replace(/\D/g, '');
}

export function createWhatsAppHref(input: { number: string; locale: 'ar' | 'en' | 'fr'; orderId?: string }): string | null {
  const number = normalizeNumber(input.number);
  if (!number) return null;
  const message = input.locale === 'ar'
    ? `مرحبا روزيت، أحتاج إلى مساعدة${input.orderId ? ` بخصوص الطلب ${input.orderId}` : ''}.`
    : input.locale === 'fr'
      ? `Bonjour Rosette, j’ai besoin d’aide${input.orderId ? ` avec la commande ${input.orderId}` : ''}.`
      : `Hello Rosette, I need help${input.orderId ? ` with order ${input.orderId}.` : '.'}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function getConfiguredWhatsAppHref(input: { locale: 'ar' | 'en' | 'fr'; orderId?: string }) {
  const number = getOptionalServerEnv('WHATSAPP_BUSINESS_NUMBER');
  return number ? createWhatsAppHref({ ...input, number }) : null;
}

export function createAdminWhatsAppHref(input: { number: string; orderId: string }): string | null {
  const digits = normalizeNumber(input.number);
  if (!digits) return null;
  const text = `Hello! This is Rosette regarding your order ${input.orderId}.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
