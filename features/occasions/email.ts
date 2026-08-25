import { escapeHtml } from '@/features/notifications/email-templates';
import { createMailTransport, type MailTransport } from '@/features/notifications/gmail-mailer';
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';
import { isEmailDeliveryDisabled } from '@/lib/runtime-config';
import { renderEngagementFooter } from '@/features/email-preferences/engagement-footer';
import type { PreferenceLocale } from '@/features/email-preferences/preferences-service';

type EmailLocale = 'en' | 'ar' | 'fr';

export type OccasionEmailInput = {
  locale: EmailLocale;
  recipientName: string;
  occasionKind: string;
  daysUntil: number;
  shopUrl: string;
  unsubscribeUrl?: string;
};

const kindLabels: Record<EmailLocale, Record<string, string>> = {
  en: { birthday: 'birthday', anniversary: 'anniversary', graduation: 'graduation', other: 'special day' },
  ar: { birthday: 'عيد ميلاد', anniversary: 'ذكرى', graduation: 'تخرج', other: 'يوم خاص' },
  fr: { birthday: 'anniversaire', anniversary: 'anniversaire de mariage', graduation: 'remise de diplôme', other: 'jour spécial' },
};

/** `daysUntil` arrives pre-computed so pluralisation stays a pure function. */
function countdown(locale: EmailLocale, days: number): string {
  if (locale === 'ar') return days === 1 ? 'غداً' : days === 2 ? 'بعد يومين' : `بعد ${days} أيام`;
  if (locale === 'fr') return days === 1 ? 'dans 1 jour' : `dans ${days} jours`;
  return days === 1 ? 'in 1 day' : `in ${days} days`;
}

function subjectFor(input: OccasionEmailInput): string {
  const kind = kindLabels[input.locale][input.occasionKind] ?? kindLabels[input.locale].other!;
  const when = countdown(input.locale, input.daysUntil);
  if (input.locale === 'ar') return `${kind} ${input.recipientName} ${when}`;
  if (input.locale === 'fr') return `L'${kind} de ${input.recipientName} est ${when}`;
  return `${input.recipientName}'s ${kind} is ${when}`;
}

const cta: Record<EmailLocale, string> = {
  en: 'Choose their flowers',
  ar: 'اختر الزهور',
  fr: 'Choisissez ses fleurs',
};

const lede: Record<EmailLocale, string> = {
  en: 'A little notice, so the day is not a surprise to you.',
  ar: 'تنبيه صغير، حتى لا يكون اليوم مفاجأة لك.',
  fr: 'Un petit rappel, pour que le jour ne vous surprenne pas.',
};

export function renderOccasionEmail(input: OccasionEmailInput): { subject: string; text: string; html: string } {
  const subject = subjectFor(input);
  const url = escapeHtml(input.shopUrl);
  const footer = input.unsubscribeUrl
    ? renderEngagementFooter(input.locale as PreferenceLocale, input.unsubscribeUrl)
    : { text: '', html: '' };
  const text = `${subject}\n${lede[input.locale]}\n${input.shopUrl}${footer.text}`;
  const html = `<!doctype html><html lang="${input.locale}"><body style="font-family:Arial,sans-serif"><h1>${escapeHtml(subject)}</h1><p>${escapeHtml(lede[input.locale])}</p><p><a href="${url}">${escapeHtml(cta[input.locale])}</a></p>${footer.html}</body></html>`;
  return { subject, text, html };
}

export async function sendOccasionEmail(
  input: OccasionEmailInput & { to: string },
  injectedTransport?: MailTransport,
): Promise<void> {
  if (!injectedTransport && isEmailDeliveryDisabled()) throw new Error('Email delivery disabled');
  const transport = injectedTransport ?? createMailTransport();
  const from = injectedTransport ? (getOptionalServerEnv('GMAIL_FROM') ?? 'Rosette <no-reply@example.invalid>') : getRequiredServerEnv('GMAIL_FROM');
  const { subject, text, html } = renderOccasionEmail(input);
  await transport.sendMail({
    from,
    to: input.to,
    subject,
    text,
    html,
    ...(input.unsubscribeUrl
      ? {
        headers: {
          'List-Unsubscribe': `<${input.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }
      : {}),
  });
}
