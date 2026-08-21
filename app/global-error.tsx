'use client';

/**
 * Root global error boundary. CSS may not have loaded at this point, so the
 * Rosette palette is inlined rather than relying on design tokens.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fdf6f0', color: '#1a0f14', fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
        <main style={{ maxWidth: '32rem', textAlign: 'center' }} role="alert">
          <p style={{ margin: 0, fontSize: '.75rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#6f8f6d' }}>
            Rosette
          </p>
          <h1 style={{ margin: '.75rem 0 1rem', fontSize: 'clamp(2rem, 5vw, 2.75rem)', lineHeight: 1.1, color: '#8e1a3f', fontWeight: 600 }}>
            Something wilted on our end.
          </h1>
          <p style={{ margin: '0 0 2rem', lineHeight: 1.7, color: '#5a3d47' }}>
            The page could not be arranged. Please try again — your bag is safe.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ border: 'none', borderRadius: '999px', background: '#8e1a3f', color: '#fff', padding: '1rem 2.25rem', fontSize: '.9375rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ marginTop: '1.5rem', fontFamily: 'ui-monospace, monospace', fontSize: '.75rem', letterSpacing: '.05em', color: '#5a3d47', opacity: 0.7 }}>
              ref {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
