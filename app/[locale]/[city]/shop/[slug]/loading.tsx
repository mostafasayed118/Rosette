/** Skeleton mirroring the 7/5 product-detail split. */
export default function ProductLoading() {
  return (
    <div className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24" role="status" aria-live="polite">
      <span className="sr-only">Loading this bouquet</span>
      <div className="h-3 w-32 animate-pulse rounded-full bg-surface-container" />
      <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-12 items-start">
        <div className="flex gap-4 md:col-span-7">
          <div className="hidden w-24 shrink-0 md:block">
            <div className="h-32 w-24 animate-pulse rounded-lg bg-surface-container" />
          </div>
          <div className="aspect-[4/5] w-full animate-pulse rounded-[1.25rem] bg-surface-container md:aspect-[3/4]" />
        </div>
        <div className="flex flex-col gap-6 md:col-span-5">
          <div className="h-3 w-40 animate-pulse rounded-full bg-surface-container" />
          <div className="h-12 w-4/5 animate-pulse rounded-lg bg-surface-container" />
          <div className="h-5 w-32 animate-pulse rounded-full bg-surface-container" />
          <div className="space-y-3">
            <div className="h-4 w-full animate-pulse rounded-full bg-surface-container" />
            <div className="h-4 w-5/6 animate-pulse rounded-full bg-surface-container" />
          </div>
          <div className="flex flex-wrap gap-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-12 w-32 animate-pulse rounded-full bg-surface-container" />
            ))}
          </div>
          <div className="h-24 w-full animate-pulse rounded-lg bg-surface-container" />
          <div className="h-14 w-full animate-pulse rounded-lg bg-surface-container" />
          <div className="grid grid-cols-3 gap-6 pt-6">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg bg-surface-container" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
