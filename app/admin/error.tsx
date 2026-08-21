'use client';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-content-center justify-items-start gap-5 p-8" role="alert">
      <p className="price text-xs uppercase tracking-[0.16em] text-sage">Admin</p>
      <h1 className="font-display text-3xl font-medium text-primary">This panel could not load.</h1>
      <p className="max-w-md text-on-surface-variant">The request failed. Retry, or check the service logs if it keeps happening.</p>
      <button
        type="button"
        onClick={reset}
        className="press rounded-full bg-primary px-7 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-on-primary-fixed-variant"
      >
        Try again
      </button>
      {error.digest ? <p className="price text-xs text-on-surface-variant/70">ref {error.digest}</p> : null}
    </div>
  );
}
