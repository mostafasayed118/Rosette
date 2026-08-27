import { escapeHtml } from '@/features/notifications/email-templates';
import { createMailTransport, type MailTransport } from '@/features/notifications/gmail-mailer';
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';
import { isEmailDeliveryDisabled } from '@/lib/runtime-config';

type Locale = 'en' | 'ar' | 'fr';
export type SubscriptionEmailType = 'activated' | 'paused' | 'resumed' | 'renewal_nudge' | 'completed' | 'cancelled_credit';
export type SubscriptionEmailInput = { locale: Locale; planName: string; code?: string; creditMinor?: number; plansUrl?: string };

const subjects: Record<SubscriptionEmailType, Record<Locale, string>> = {
  activated: { en: 'Your subscription is active', ar: 'اشتراكك نشط', fr: 'Votre abonnement est actif' },
  paused: { en: 'Your subscription is paused', ar: 'تم إيقاف اشتراكك مؤقتاً', fr: 'Votre abonnement est en pause' },
  resumed: { en: 'Your subscription is active again', ar: 'اشتراكك نشط مرة أخرى', fr: 'Votre abonnement est de nouveau actif' },
  renewal_nudge: { en: 'Time to renew your flower subscription', ar: 'حان وقت تجديد اشتراكك', fr: 'Il est temps de renouveler votre abonnement' },
  completed: { en: 'Your flower subscription is complete', ar: 'اكتمل اشتراكك', fr: 'Votre abonnement est terminé' },
  cancelled_credit: { en: 'Your store credit is ready', ar: 'رصيد المتجر جاهز', fr: 'Votre crédit boutique est prêt' },
};
const cta: Record<Locale, Record<SubscriptionEmailType, string>> = {
  en: { activated: 'View subscription', paused: '', resumed: '', renewal_nudge: 'Renew for 10% off', completed: 'Start a new subscription', cancelled_credit: 'Shop with your credit' },
  ar: { activated: 'عرض الاشتراك', paused: '', resumed: '', renewal_nudge: 'جدّد بخصم 10%', completed: 'ابدأ اشتراكاً جديداً', cancelled_credit: 'تسوق برصيدك' },
  fr: { activated: 'Voir l\u2019abonnement', paused: '', resumed: '', renewal_nudge: 'Renouveler avec -10%', completed: 'Démarrer un nouvel abonnement', cancelled_credit: 'Acheter avec votre crédit' },
};

export function renderSubscriptionEmail(type: SubscriptionEmailType, input: SubscriptionEmailInput): { subject: string; text: string; html: string } {
  const subject = `${subjects[type][input.locale]} · ${input.planName}`;
  const url = input.plansUrl ? escapeHtml(input.plansUrl) : '';
  const code = input.code ? escapeHtml(input.code) : '';
  const label = cta[input.locale][type];
  const button = label && url ? `<p style="margin:24px 0"><a href="${url}" style="background:#2d6a4f;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px">${escapeHtml(label)}</a></p>` : '';
  let body = '';
  if (type === 'renewal_nudge') body = input.locale === 'ar' ? `استخدم الرمز ${code} للحصول على خصم 10% عند التجديد.` : input.locale === 'fr' ? `Utilisez le code ${code} pour 10% de remise.` : `Use code ${code} for 10% off your next bundle.`;
  if (type === 'cancelled_credit') body = input.locale === 'ar' ? `تمت إضافة رصيد متجر. رمزك: ${code}` : input.locale === 'fr' ? `Un crédit boutique a été ajouté. Votre code : ${code}` : `Store credit added. Your code: ${code}`;
  const html = `<!doctype html><html lang="${input.locale}"><body style="font-family:Arial,sans-serif"><h1>${escapeHtml(subject)}</h1>${body ? `<p>${escapeHtml(body)}</p>` : ''}${button}</body></html>`;
  const text = `${subject}\n${body}${input.plansUrl ? `\n${input.plansUrl}` : ''}`;
  return { subject, text, html };
}

export async function sendSubscriptionEmail(input: SubscriptionEmailInput & { type: SubscriptionEmailType; to: string }, injectedTransport?: MailTransport): Promise<void> {
  if (!injectedTransport && isEmailDeliveryDisabled()) throw new Error('Email delivery disabled');
  const transport = injectedTransport ?? createMailTransport();
  const from = injectedTransport ? (getOptionalServerEnv('GMAIL_FROM') ?? 'Rosette <no-reply@example.invalid>') : getRequiredServerEnv('GMAIL_FROM');
  const { subject, text, html } = renderSubscriptionEmail(input.type, input);
  await transport.sendMail({ from, to: input.to, subject, text, html });
}
