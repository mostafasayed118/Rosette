const ASPECTS = ['aspect-[3/4]', 'aspect-square', 'aspect-[4/5]', 'aspect-[3/4]'] as const;

/** Skeleton mirroring the two-column masonry collection grid. */
export default function ShopLoading() {
  return (
    <div className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24" role="status" aria-live="polite">
      <span className="sr-only">Loading the collection</span>
      <div className="border-b border-outline-variant/25 pb-12">
        <div className="h-3 w-44 animate-pulse rounded-full bg-surface-container" />
        <div className="mt-4 h-12 w-2/3 max-w-lg animate-pulse rounded-lg bg-surface-container" />
        <div className="mt-5 h-4 w-full max-w-2xl animate-pulse rounded-full bg-surface-container" />
      </div>
      <div className="flex flex-wrap gap-3 py-6">
        <div className="h-11 w-64 animate-pulse rounded-full bg-surface-container" />
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-10 w-24 animate-pulse rounded-full bg-surface-container" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-12 items-start">
        {[0, 1].map((column) => (
          <div key={column} className={`flex flex-col gap-12 ${column === 1 ? 'md:pt-12' : ''}`}>
            {[0, 1, 2, 3].map((row) => (
              <div key={row}>
                <div className={`w-full animate-pulse rounded-[1rem] bg-surface-container ${ASPECTS[(column * 2 + row) % ASPECTS.length]}`} />
                <div className="mt-4 h-3 w-24 animate-pulse rounded-full bg-surface-container" />
                <div className="mt-2 h-6 w-2/3 animate-pulse rounded-lg bg-surface-container" />
                <div className="mt-2 h-3 w-1/2 animate-pulse rounded-full bg-surface-container" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
