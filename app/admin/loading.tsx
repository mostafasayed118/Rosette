/** Admin table skeleton — matches the row rhythm of the admin lists. */
export default function AdminLoading() {
  return (
    <div className="grid gap-6 p-8" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-container" />
      <div className="grid gap-3">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="h-12 w-full animate-pulse rounded-lg bg-surface-container" />
        ))}
      </div>
    </div>
  );
}
