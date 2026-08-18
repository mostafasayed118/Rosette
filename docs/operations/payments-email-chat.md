# Rosette commerce operations

## Secrets

Copy `.env.example` to `.env.local` and fill values locally. Never paste keys into chat, source files, GitHub, screenshots, or browser code. The Supabase service-role key, Paymob API/HMAC values, Gmail app password, and Groq key are server-only.

The Gmail app password previously exposed during setup was revoked. Create a new app password only after enabling Google 2-Step Verification, then store it in `.env.local` or the deployment secret manager.

## Supabase

1. Create a Supabase project.
2. Apply `supabase/migrations/001_commerce.sql`.
3. Run `supabase/seed.sql` for public cities/categories.
4. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Configure `SUPABASE_SERVICE_ROLE_KEY` only on the server/deployment dashboard.
6. Create the first admin user, then set its `profiles.role` to `admin` through a protected database workflow.

The app uses local mock data when Supabase public configuration is absent.

## Paymob test mode

1. Create or access the Paymob Egypt merchant dashboard.
2. Use test credentials and a test integration ID while developing.
3. Configure the webhook URL:

```text
https://<deployment-host>/api/webhooks/paymob
```

4. Configure the success redirect through the Intention API response flow.
5. Set `PAYMOB_API_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_HMAC_SECRET`, and `PAYMOB_BASE_URL`.
6. Test success, decline, duplicate callback, amount mismatch, and invalid HMAC cases.

The browser redirect is not payment authority. Only a verified Paymob callback can mark an order paid.

## Gmail SMTP

Set:

```env
GMAIL_USER=your-business-email@gmail.com
GMAIL_APP_PASSWORD=<local-secret-only>
GMAIL_FROM=your-business-email@gmail.com
```

The app sends bilingual order messages from server code at these points:

- `order_received` — when the order is placed (before payment).
- `payment_confirmed` — when Paymob confirms payment.
- `ready_for_delivery`, `out_for_delivery`, `delivered` — on the matching admin fulfillment transition.

Every send is recorded in `notification_deliveries` (`pending` → `sent`/`failed`). Gmail is intended for low-volume MVP traffic and has provider sending limits. Email failures are recorded as retryable and do not reverse a successful payment.

### Retry job

A cron endpoint retries deliveries stuck in `failed` (up to
`NOTIFICATION_RETRY_MAX_ATTEMPTS`, default 3) or stale `pending` (older than
`NOTIFICATION_RETRY_STALE_PENDING_MINUTES`, default 15 minutes). Both values
are optional positive-integer env vars that fall back to those defaults when
unset or invalid:

```text
POST /api/cron/notifications
Authorization: Bearer <CRON_SECRET>
```

The repo ships a GitHub Actions scheduler
(`.github/workflows/cron-notifications.yml`) that runs every 15 minutes and
can also be triggered manually. It needs two repository secrets, added under
**GitHub → Settings → Secrets and variables → Actions**:

- `CRON_ENDPOINT` — the full endpoint URL, e.g.
  `https://<your-domain>/api/cron/notifications`
- `CRON_SECRET` — the same random string set in the app environment

Any other scheduler (Render cron, Fly.io machines) can hit the same endpoint
with the same `Authorization: Bearer <CRON_SECRET>` header. The response
reports `{ retried, sent, failed, skipped }`. Set `CRON_SECRET` and `SITE_URL`
in the app environment; `SITE_URL` must be set so retried email links use the
public domain.

A smoke-test workflow (`.github/workflows/smoke-cron.yml`) checks the endpoint
daily and on demand: it asserts unauthenticated requests return 401 and an
authenticated request returns 200 with the summary. Run it manually and pass a
staging URL via the `url` input to verify a freshly deployed environment.

## Groq chatbot

Set `GROQ_API_KEY` and optionally `GROQ_MODEL`. The API key is used only by `/api/chat`. The deterministic guard rejects unrelated questions and prompt-injection attempts before a model call. Model output is schema-validated and product slugs are checked against the catalog.

If Groq is unavailable, the app shows a verified fallback and WhatsApp handoff.

## WhatsApp

Set `WHATSAPP_BUSINESS_NUMBER` as digits with country code, for example `201000000000`. The first release uses a free `wa.me` human-handoff link. Automated WhatsApp Cloud API messages are not enabled.

## Local verification

```bash
npm install
npm test
npm run lint
npm run build
npm audit --omit=dev
```

Do not use live Paymob, Gmail, or Groq credentials in automated tests. Adapter tests use deterministic fakes.
