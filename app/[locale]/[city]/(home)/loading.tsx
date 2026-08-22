/** Skeletal shimmer matching the storefront hero — never a spinner. */
export default function StorefrontLoading() {
  return (
    <div className="mx-auto max-w-[1280px] px-5 md:px-[64px] pt-16 md:pt-32 pb-24" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
        <div className="lg:col-span-5 order-2 lg:order-1 lg:pl-8">
          <div className="h-3 w-40 animate-pulse rounded-full bg-surface-container" />
          <div className="mt-7 space-y-4">
            <div className="h-12 w-full animate-pulse rounded-lg bg-surface-container" />
            <div className="h-12 w-4/5 animate-pulse rounded-lg bg-surface-container" />
            <div className="h-12 w-2/3 animate-pulse rounded-lg bg-surface-container" />
          </div>
          <div className="mt-9 space-y-3">
            <div className="h-4 w-full animate-pulse rounded-full bg-surface-container" />
            <div className="h-4 w-5/6 animate-pulse rounded-full bg-surface-container" />
          </div>
          <div className="mt-11 h-14 w-56 animate-pulse rounded-full bg-surface-container" />
        </div>
        <div className="lg:col-span-7 order-1 lg:order-2">
          <div className="aspect-[4/5] w-full animate-pulse rounded-[1.25rem] bg-surface-container" />
        </div>
      </div>
      <div className="mt-24 flex gap-8 overflow-hidden">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="w-[280px] shrink-0 md:w-[320px]">
            <div className="aspect-[3/4] w-full animate-pulse rounded-[1rem] bg-surface-container" />
            <div className="mt-5 h-4 w-2/3 animate-pulse rounded-full bg-surface-container" />
          </div>
        ))}
      </div>
    </div>
  );
}
