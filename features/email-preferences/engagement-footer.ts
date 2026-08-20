import { escapeHtml } from '@/features/notifications/email-templates';
import type { PreferenceLocale } from './preferences-service';

const copy: Record<PreferenceLocale, { unsubscribe: string; confirmationTitle: string; confirmationBody: string }> = {
  en: { unsubscribe: 'Unsubscribe from Rosette engagement emails', confirmationTitle: 'Email preference updated', confirmationBody: 'You have been unsubscribed from Rosette engagement emails.' },
  ar: { unsubscribe: 'إلغاء الاشتراك من رسائل روزيت الترويجية', confirmationTitle: 'تم تحديث تفضيلات البريد', confirmationBody: 'تم إلغاء اشتراكك من رسائل روزيت الترويجية.' },
  fr: { unsubscribe: 'Se désabonner des e-mails d’engagement Rosette', confirmationTitle: 'Préférence e-mail mise à jour', confirmationBody: 'Vous êtes désabonné des e-mails d’engagement Rosette.' },
};

export function renderEngagementFooter(locale: PreferenceLocale, unsubscribeUrl: string) {
  const c = copy[locale];
  const url = escapeHtml(unsubscribeUrl);
  return {
    text: `\n\n${c.unsubscribe}: ${unsubscribeUrl}`,
    html: `<hr><p><a href="${url}">${c.unsubscribe}</a></p>`,
  };
}

export function renderUnsubscribeConfirmation(locale: PreferenceLocale) {
  const c = copy[locale];
  return `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${c.confirmationTitle}</title></head><body><h1>${c.confirmationTitle}</h1><p>${c.confirmationBody}</p></body></html>`;
}

export function preferenceLocale(value: string | null): PreferenceLocale {
  return value === 'ar' || value === 'fr' ? value : 'en';
}
