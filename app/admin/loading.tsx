import { Skeleton } from '@/components/ui/skeleton';

export default function AdminLoading() {
  return (
    <div className="grid gap-6 p-4 md:p-8" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-48" />
        <div className="ms-auto flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="grid gap-3">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
