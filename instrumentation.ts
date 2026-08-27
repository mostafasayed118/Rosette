export async function register() {
  // No route in this app opts into the edge runtime, so only the nodejs bundle
  // is initialized. On Cloudflare, OpenNext runs the nodejs server bundle
  // under nodejs_compat; @sentry/nextjs' edge flavor is not needed here.
  //
  // NOTE: @sentry/nextjs is intentionally NOT imported yet. Its node SDK
  // performs dynamic `require("fs")` probes at module-load time, which throws
  // `Dynamic require of "fs" is not supported` under workerd and 500s every
  // request — and it also adds ~hundreds of KB to the worker bundle (over the
  // Cloudflare free-plan 3 MiB limit). Re-enable only after moving this app to
  // a paid Workers plan AND configuring NEXT_PUBLIC_SENTRY_DSN, e.g.:
  //
  // if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  //   await import('./sentry.server.config');
  // }
}
