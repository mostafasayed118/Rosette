# Rosette free production deployment — design

**Date:** 2026-08-20
**Status:** Approved for implementation

## Goal

Deploy Rosette as a real low-volume production storefront with zero required software subscriptions, using Cloudflare Workers/OpenNext, Supabase Free, provider subdomains, free quotas, and payment methods that do not pretend transaction fees are free.

## Scope

This first implementation covers the core production deployment boundary:

- Cloudflare Workers deployment through `@opennextjs/cloudflare`.
- Supabase Free as the existing database, Auth, Storage, and RPC provider.
- Provider-subdomain configuration with no custom domain requirement.
- Cash on Delivery/manual payment as the real-order path.
- Paymob test mode as an optional simulated payment path; live card payments are not enabled by default.
- Runtime-safe optional email delivery because raw Gmail SMTP may not work in Cloudflare Workers.
- Existing deterministic chatbot fallback as the required AI path.
- GitHub Actions deployment and notification retry workflows.
- Documentation for secrets, quotas, rollback, and smoke verification.

The following remain optional follow-up work and do not block deployment: Turnstile, Cloudflare Web Analytics, UptimeRobot, automated backups, and a free HTTPS email provider.

## Locked decisions

- Fly.io is removed from the supported deployment path and repository configuration.
- Cloudflare Workers with `@opennextjs/cloudflare` is the target runtime; the older Pages adapter is not used.
- OpenNext uses the Next.js Node.js runtime compatibility layer, not Next Edge runtime conversion.
- Supabase remains unchanged as the backend provider; existing migrations and RLS are preserved.
- Real orders use Cash on Delivery/manual payment unless the operator explicitly enables a separate payment mode.
- Paymob is test-only by default for the zero-cost deployment.
- Email failure never invalidates an order, gift-card activation, or account operation.
- SMTP email remains available for local/Node deployments, but Cloudflare production may disable SMTP through configuration.
- No secrets are committed, logged, or sent to client components.
- Deployment configuration is staged: keep rollback information until the Cloudflare deployment passes verification, then remove Fly-specific files.

## Runtime and payment configuration

Add explicit server-only configuration:

- `DEPLOYMENT_RUNTIME`: `cloudflare` or `node`.
- `PAYMENT_MODE`: `cod`, `paymob_test`, or `paymob_live`; production zero-cost defaults to `cod`.
- `EMAIL_DELIVERY_MODE`: `disabled` or `smtp`; Cloudflare production defaults to `disabled`, Node deployments may use `smtp`.

The existing checkout must continue to show only payment methods enabled by `PAYMENT_MODE`. The server must reject a Paymob request when Paymob is not enabled/configured, and it must never infer payment authority from a browser redirect. COD/manual orders must remain visibly pending/manual until an authorized admin action changes payment state.

The existing notification delivery boundary remains the source of truth. When `EMAIL_DELIVERY_MODE=disabled`, notification attempts are recorded as a controlled skipped/disabled result rather than throwing during order creation. Gift-card delivery remains active-value-safe: a paid card is created even if delivery is disabled or fails, and admin resend is unavailable until an email delivery mode is configured.

## Cloudflare deployment

Add the OpenNext Cloudflare adapter and Wrangler configuration. The deployment must:

- build with the existing `npm run build` before OpenNext transforms output;
- preserve App Router routes, Route Handlers, dynamic routes, SSR, SSG, and proxy/middleware behavior;
- expose the configured provider URL through `SITE_URL` for callback and email links;
- use Cloudflare secrets for Supabase service role, Paymob test values, application secrets, and optional email credentials;
- fail the build when the compressed Worker exceeds the free-plan size limit reported by Wrangler;
- deploy through GitHub Actions using `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets;
- preserve the current notification retry workflow by setting `CRON_ENDPOINT` to the Cloudflare URL;
- provide a Wrangler local preview command for route smoke tests.

Cloudflare configuration must not contain secret values. The public `workers.dev` URL is the default origin; a custom domain is optional and outside the strict `$0` requirement.

## Email boundary

Keep the existing `MailTransport` interface and Gmail SMTP adapter for Node-compatible environments. Add a controlled disabled adapter or mode check so Cloudflare production does not attempt raw SMTP. Notification records must distinguish disabled delivery from an application failure, and order/gift-card flows must continue without email.

The email-preference unsubscribe endpoint remains deployed, but signed unsubscribe links are only emitted when email delivery is enabled. The preference table and account control remain functional independent of email delivery.

## Security and operational controls

- Keep Supabase RLS and service-role boundaries unchanged.
- Keep Paymob HMAC, amount checks, idempotency, and gift-card atomic RPCs unchanged.
- Keep `.env.local` ignored and add all new configuration names to `.env.example`.
- Add a configuration test proving invalid payment/runtime combinations fail safely.
- Add deployment documentation for Cloudflare secrets, COD/manual operations, test payments, disabled email behavior, and rollback.
- Do not add artificial uptime traffic or automatic paid upgrades.
- Document that provider quotas, Paymob fees for live cards, fulfillment, and business operations are not software-free.

## Verification requirements

Before removing Fly configuration or claiming deployment readiness:

1. `npm test` passes with provider-independent test environment isolation.
2. `npm run lint` passes.
3. `npm run build` passes.
4. OpenNext build passes and reports an acceptable Worker size.
5. Wrangler local preview serves the homepage, localized redirect, API route, admin guard, gift-card route, and email-preference route.
6. Supabase migration list is synchronized and the RLS/RPC checks pass.
7. COD/manual checkout creates an order without Paymob.
8. Paymob test mode remains opt-in and its existing HMAC tests pass.
9. Email-disabled mode records skipped delivery without breaking order creation.
10. GitHub Actions deployment and retry workflows contain no secrets or hard-coded private URLs.
11. Only after all checks pass may `fly.toml` and Fly-specific documentation be removed.

## Explicit non-goals

- No live card-payment activation in the strict `$0` default.
- No claim that fulfillment, payment fees, email guarantees, custom domains, or business compliance cost zero.
- No migration away from Supabase.
- No replacement email vendor without a separate provider decision and credentials.
- No mandatory AI API, maps API, SMS, WhatsApp automation, or paid monitoring.
