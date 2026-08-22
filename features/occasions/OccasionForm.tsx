'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { LEAD_DAY_CHOICES, OCCASION_KINDS } from './validation';

type Recipient = { id: string; name: string; relationship: string | null };
type SubmitResult = 'saved' | 'invalid' | 'unauthenticated' | 'failure';

type OccasionFormProps = {
  recipients: Recipient[];
  onSubmit: (payload: Record<string, unknown>) => Promise<SubmitResult>;
  initial?: {
    recipientName?: string;
    relationship?: string;
    kind?: string;
    recurrence?: 'annual' | 'once';
    month?: number | null;
    day?: number | null;
    eventDate?: string | null;
    leadDays?: number;
  };
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

export function OccasionForm({ recipients, onSubmit, initial }: OccasionFormProps) {
  const { t, locale } = useI18n();
  const [recipientName, setRecipientName] = useState(initial?.recipientName ?? '');
  const [relationship, setRelationship] = useState(initial?.relationship ?? '');
  const [kind, setKind] = useState(initial?.kind ?? 'birthday');
  const [recurrence, setRecurrence] = useState<'annual' | 'once'>(initial?.recurrence ?? 'annual');
  const [month, setMonth] = useState(String(initial?.month ?? ''));
  const [day, setDay] = useState(String(initial?.day ?? ''));
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? '');
  const [leadDays, setLeadDays] = useState(initial?.leadDays ?? 7);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const pill = (active: boolean) =>
    `press cursor-pointer rounded-full border px-5 py-2.5 text-sm transition-all duration-300 ${
      active
        ? 'border-2 border-primary bg-primary-fixed/25 text-on-surface'
        : 'border border-outline-variant/50 bg-surface text-on-surface hover:-translate-y-0.5 hover:bg-surface-container'
    }`;

  const intlLocale = locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB';
  const monthName = (value: number) => new Intl.DateTimeFormat(intlLocale, { month: 'long' }).format(new Date(Date.UTC(2026, value - 1, 1)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    // Send only the fields for the selected recurrence, so the payload matches
    // the occasion_shape DB constraint exactly.
    const payload: Record<string, unknown> = {
      recipientName,
      relationship: relationship || undefined,
      kind,
      recurrence,
      leadDays,
      locale,
      ...(recurrence === 'annual'
        ? { month: month ? Number(month) : undefined, day: day ? Number(day) : undefined }
        : { eventDate: eventDate || undefined }),
    };
    const result = await onSubmit(payload);
    setBusy(false);
    setError(result !== 'saved');
    setMessage(result === 'saved' ? t('occasionSaved') : t('occasionInvalid'));
    if (result === 'saved') {
      setRecipientName('');
      setRelationship('');
      setMonth('');
      setDay('');
      setEventDate('');
    }
  }

  return (
    <form className="grid gap-6" onSubmit={submit} noValidate>
      {message ? <StatusMessage title={message} tone={error ? 'error' : 'success'} /> : null}

      <label className="grid gap-2" htmlFor="occasion-recipient">
        <span className="text-sm font-semibold text-on-surface">{t('occasionRecipient')}</span>
        <Input
          id="occasion-recipient"
          list="occasion-recipient-options"
          value={recipientName}
          onChange={(event) => setRecipientName(event.target.value)}
          required
        />
        <datalist id="occasion-recipient-options">
          {recipients.map((recipient) => <option key={recipient.id} value={recipient.name} />)}
        </datalist>
      </label>

      <label className="grid gap-2" htmlFor="occasion-relationship">
        <span className="text-sm font-semibold text-on-surface">{t('occasionRelationship')}</span>
        <Input id="occasion-relationship" value={relationship} onChange={(event) => setRelationship(event.target.value)} />
      </label>

      <fieldset className="grid gap-3 border-0 p-0">
        <legend className="price text-xs font-medium uppercase tracking-widest text-on-surface-variant">{t('occasionKindLegend')}</legend>
        <div className="flex flex-wrap gap-3">
          {OCCASION_KINDS.map((option) => (
            <label key={option} className={pill(kind === option)}>
              <input type="radio" name="occasionKind" value={option} checked={kind === option} onChange={() => setKind(option)} className="sr-only" />
              {t(`occasionKind_${option}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 border-0 p-0">
        <legend className="price text-xs font-medium uppercase tracking-widest text-on-surface-variant">{t('occasionRecurrenceLegend')}</legend>
        <div className="flex flex-wrap gap-3">
          {(['annual', 'once'] as const).map((option) => (
            <label key={option} className={pill(recurrence === option)}>
              <input type="radio" name="recurrence" value={option} checked={recurrence === option} onChange={() => setRecurrence(option)} className="sr-only" />
              {option === 'annual' ? t('recurrenceAnnual') : t('recurrenceOnce')}
            </label>
          ))}
        </div>
      </fieldset>

      {recurrence === 'annual' ? (
        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-2" htmlFor="occasion-month">
            <span className="text-sm font-semibold text-on-surface">{t('occasionMonth')}</span>
            <select
              id="occasion-month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-11 rounded-full border border-outline-variant bg-surface px-4 text-sm"
              required
            >
              <option value="">—</option>
              {MONTHS.map((value) => <option key={value} value={value}>{monthName(value)}</option>)}
            </select>
          </label>
          <label className="grid gap-2" htmlFor="occasion-day">
            <span className="text-sm font-semibold text-on-surface">{t('occasionDay')}</span>
            <select
              id="occasion-day"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className="h-11 rounded-full border border-outline-variant bg-surface px-4 text-sm"
              required
            >
              <option value="">—</option>
              {DAYS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <label className="grid gap-2" htmlFor="occasion-date">
          <span className="text-sm font-semibold text-on-surface">{t('occasionDate')}</span>
          <Input id="occasion-date" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required />
        </label>
      )}

      <fieldset className="grid gap-3 border-0 p-0">
        <legend className="price text-xs font-medium uppercase tracking-widest text-on-surface-variant">
          {t('remindDaysBefore', { days: leadDays })}
        </legend>
        <div className="flex flex-wrap gap-3">
          {LEAD_DAY_CHOICES.map((value) => (
            <label key={value} className={pill(leadDays === value)}>
              <input type="radio" name="leadDays" value={value} checked={leadDays === value} onChange={() => setLeadDays(value)} className="sr-only" />
              {value}
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={busy} className="lift press justify-center">
        {initial ? t('editDate') : t('addDate')}
      </Button>
    </form>
  );
}
