import Link from 'next/link';
import { getPaginationRange } from '@/lib/pagination';

type Props = {
  current: number;
  pageCount: number;
  total: number;
  label: string;
  pageHref: (p: number) => string;
};

export function AdminPagination({ current, pageCount, total, label, pageHref }: Props) {
  if (pageCount <= 1) return null;
  const range = getPaginationRange(current, pageCount, 1);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-1" role="navigation" aria-label="Pagination">
        {current > 1 ? (
          <Link href={pageHref(current - 1)} className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border bg-background px-2 text-sm hover:bg-accent" aria-label="Previous page">
            ←
          </Link>
        ) : null}
        {range.map((item, idx) =>
          item === 'ellipsis' ? (
            <span key={`e-${idx}`} className="px-1 text-muted-foreground">
              …
            </span>
          ) : (
            <Link
              key={item}
              href={pageHref(item)}
              aria-current={item === current ? 'page' : undefined}
              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm tabular-nums ${item === current ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent'}`}
            >
              {item}
            </Link>
          ),
        )}
        {current < pageCount ? (
          <Link href={pageHref(current + 1)} className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border bg-background px-2 text-sm hover:bg-accent" aria-label="Next page">
            →
          </Link>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">
        Page {current} of {pageCount} · {total} {label}
      </p>
    </div>
  );
}
