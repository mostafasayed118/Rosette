'use client';

import { CalendarHeart, X } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';
import type { OccasionRow } from './repository';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatWhen(occasion: OccasionRow): string {
  if (occasion.recurrence === 'once') return occasion.eventDate ?? '';
  if (occasion.month == null || occasion.day == null) return '';
  return `${occasion.day} ${MONTH_NAMES[occasion.month - 1] ?? ''}`.trim();
}

export function OccasionList({ occasions, onRemove }: { occasions: OccasionRow[]; onRemove: (id: string) => void }) {
  const { t } = useI18n();

  if (occasions.length === 0) {
    return (
      <div className="grid justify-items-start gap-4 border-t border-outline-variant/25 py-16">
        <CalendarHeart className="h-8 w-8 text-sage" aria-hidden="true" />
        <p className="font-display text-2xl text-on-surface">{t('occasionsEmpty')}</p>
        <p className="max-w-md text-sm leading-relaxed text-on-surface-variant">{t('occasionsEmptyHint')}</p>
      </div>
    );
  }

  return (
    <ul className="grid">
      {occasions.map((occasion) => (
        <li key={occasion.id} className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant/40 py-5">
          <span className="grid gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <strong className="text-sm font-semibold text-on-surface">{occasion.recipientName}</strong>
              {occasion.relationship ? <span className="text-sm text-on-surface-variant">· {occasion.relationship}</span> : null}
            </span>
            <span className="text-sm text-on-surface-variant">{t(`occasionKind_${occasion.kind}`)}</span>
            <span className="price text-xs text-on-surface-variant">{t('remindDaysBefore', { days: occasion.leadDays })}</span>
          </span>
          <span className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                occasion.recurrence === 'annual'
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              {occasion.recurrence === 'annual' ? t('recurrenceAnnual') : t('recurrenceOnce')}
            </span>
            <span className="price text-sm text-on-surface">{formatWhen(occasion)}</span>
            <button
              type="button"
              onClick={() => onRemove(occasion.id)}
              aria-label={t('removeDate')}
              className="press grid h-9 w-9 place-items-center rounded-full border border-outline-variant/50 text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
