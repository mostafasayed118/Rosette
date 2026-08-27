import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Free tier: 5k errors/mo. Sample 10% perf, 100% in dev.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Keep bundle small - only send if DSN present
  beforeSend(event) {
    // Never send PII - logger.ts already redacts
    return event;
  },
});
