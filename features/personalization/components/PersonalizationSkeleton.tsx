'use client';

import { useI18n } from '@/features/i18n/I18nProvider';

export function PersonalizationSkeleton({ count = 3 }: { count?: number }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={t('personalizationRecommended')}
      className="grid grid-cols-2 gap-4 md:grid-cols-4"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} aria-hidden="true" className="aspect-[3/4] animate-pulse rounded-xl bg-surface-container" />
      ))}
    </div>
  );
}
