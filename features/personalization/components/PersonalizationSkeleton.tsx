import { messages } from '@/features/i18n/dictionaries';
import type { Locale } from '@/features/i18n/types';

export function PersonalizationSkeleton({ count = 3, locale }: { count?: number; locale?: Locale }) {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={messages[locale ?? 'en'].personalizationRecommended}
      dir={dir}
      className="grid grid-cols-2 gap-4 md:grid-cols-4"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} aria-hidden="true" className="h-64 animate-pulse rounded-xl bg-surface-container" />
      ))}
    </div>
  );
}
