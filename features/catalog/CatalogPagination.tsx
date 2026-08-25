'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { parseCatalogQuery, serializeCatalogQuery } from './catalog-utils';

type CatalogPaginationProps = { page: number; perPage: number; totalPages: number; total: number };

/** Compact page window: always shows first/last with an ellipsis around the active page. */
export function pageWindow(page: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) result.push('gap');
    result.push(value);
    previous = value;
  }
  return result;
}

export function CatalogPagination({ page, perPage, totalPages, total }: CatalogPaginationProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (total === 0) return null;

  const query = parseCatalogQuery(new URLSearchParams(searchParams.toString()));
  const hrefFor = (target: number) => {
    const serialized = serializeCatalogQuery({ ...query, page: target });
    return `${pathname}${serialized ? `?${serialized}` : ''}`;
  };

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const arrowClass = 'press grid h-11 w-11 place-items-center rounded-full border border-outline-variant/60 bg-surface text-on-surface transition-all duration-300 hover:-translate-y-0.5 hover:border-primary hover:text-primary';
  const disabledClass = 'grid h-11 w-11 place-items-center rounded-full border border-outline-variant/30 bg-surface-container text-on-surface-variant/40';

  return (
    <nav className="mt-16 flex flex-col items-center gap-5 border-t border-outline-variant/25 pt-10" aria-label={t('pagination')}>
      <p className="price text-xs tracking-[0.08em] text-on-surface-variant">
        {t('showingRange', { from, to, total })}
      </p>

      {totalPages > 1 ? (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} className={arrowClass} aria-label={t('prevPage')} rel="prev">
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span className={disabledClass} aria-hidden="true"><ChevronLeft className="h-4 w-4" /></span>
          )}

          {pageWindow(page, totalPages).map((entry, index) =>
            entry === 'gap' ? (
              <span key={`gap-${index}`} className="px-1 text-on-surface-variant/60" aria-hidden="true">…</span>
            ) : entry === page ? (
              <span key={entry} aria-current="page" className="price grid h-11 min-w-11 place-items-center rounded-full bg-primary px-4 text-sm font-semibold text-on-primary shadow-[0_4px_14px_-4px_rgb(58_20_30_/_35%)]">
                {entry}
              </span>
            ) : (
              <Link key={entry} href={hrefFor(entry)} className="price press grid h-11 min-w-11 place-items-center rounded-full border border-outline-variant/50 bg-surface px-4 text-sm text-on-surface transition-all duration-300 hover:-translate-y-0.5 hover:border-primary hover:text-primary">
                {entry}
              </Link>
            ),
          )}

          {page < totalPages ? (
            <Link href={hrefFor(page + 1)} className={arrowClass} aria-label={t('nextPage')} rel="next">
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className={disabledClass} aria-hidden="true"><ChevronRight className="h-4 w-4" /></span>
          )}
        </div>
      ) : null}
    </nav>
  );
}
