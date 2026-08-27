export async function register() {
  // No route in this app opts into the edge runtime, so only the nodejs bundle
  // is initialized. On Cloudflare, OpenNext runs the nodejs server bundle
  // under nodejs_compat; @sentry/nextjs' edge flavor is not needed here.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
}
