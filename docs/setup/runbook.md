# Rosette — setup runbook

Take the running storefront from code to a tested, live store. Every step here
is manual and needs your accounts; no secret value should ever be pasted into
chat, a source file, or GitHub. This guide complements
`docs/operations/payments-email-chat.md`, which describes each integration's
behavior.

Expected time: 1–2 hours the first time, mostly waiting on account approvals.

---

## 0. What you need

| Thing | Account to create | Cost |
| --- | --- | --- |
| Node.js 20+ | — | free |
| PostgreSQL database | Supabase project | free tier |
| Online payments (EGP) | Paymob Egypt merchant dashboard | test mode free |
| Transactional email | Gmail + app password (2-Step Verification) | free |
| Chatbot | Groq API key | free tier |
| WhatsApp handoff | any WhatsApp number | free |
| Public HTTPS during local testing | ngrok or cloudflared | free |
| Production host | Cloudflare Workers via OpenNext (`*.workers.dev`) | free tier |

> Hosting note: the storefront deploys to Cloudflare Workers (OpenNext) on a
> free `workers.dev` subdomain. The worker script must stay under Cloudflare's
> 3 MiB compressed free-plan limit (the `npm run cf:build` gate checks this).
> Real orders use Cash on Delivery / manual confirmation; online card payments
> are Paymob test mode only unless you accept the per-transaction fee.

---

## 1. Local health check

```bash
git clone https://github.com/mostafasayed118/Rosette.git
cd Rosette
npm install
npm test        # the repository test suite should pass
npm run lint    # tsc --noEmit, must be clean
npm run build   # production build must succeed
npm run dev
```

Open `http://localhost:3000`. Without configuration the app runs on local mock
data — that is expected. The storefront switches to Supabase only when
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present
in `.env.local`.

---

## 2. Supabase: project, schema, catalog

### 2.1 Create the project

1. Go to `https://supabase.com/dashboard` → **New project** → pick a name,
   a strong database password, and a region close to Egypt.
2. In **Project Settings → API**, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY` (server-only)

### 2.2 Apply the migrations

Open the **SQL Editor** in the dashboard and, in numeric order, paste and
**Run** the full content of each file under `supabase/migrations/`
(`001_commerce.sql`, `002_profiles_policy.sql`,
`003_french_localization.sql`, `004_product_images.sql`,
`005_customer_accounts.sql`, `006_blog.sql`,
`007_blog_authors.sql`, `008_promos.sql`, `009_order_cancel_requests.sql`,
`010_product_reviews.sql`, `011_order_change_requests.sql`,
`012_wishlist.sql`, `013_abandoned_carts.sql`, `014_review_engagement.sql`,
`015_email_preferences.sql`, `016_gift_cards.sql`,
`017_notification_skipped.sql`). `001` creates:

- `profiles`, `categories`, `products`, `product_variants`, `cities`,
  `delivery_rules`, `inventory`, `orders`, `order_items`,
  `inventory_reservations`, `payments`, `order_events`,
  `notification_deliveries`, `admin_audit_logs`
- Row-level security on customer data
- `reserve_order_inventory()` — the atomic stock-reservation function used at
  checkout

### 2.3 Seed the catalog

Paste the full content of `supabase/seed.sql` in the SQL Editor and **Run**.
The seed is idempotent (fixed ids + `on conflict do update`), so re-running
it is safe and syncs any later catalog edits.

Expected result:

```sql
select count(*) from public.products;        -- 16
select count(*) from public.product_variants; -- 26
select count(*) from public.cities;           -- 11
select count(*) from public.delivery_rules;   -- 11
```

### 2.4 Create your admin account

1. **Authentication → Users** in the Supabase dashboard. If you have no user
   yet, add one (or enable Email sign-ups and register through the app).
2. Copy the new user's UUID.
3. In the SQL Editor:

```sql
insert into public.profiles (id, display_name, role)
values ('<paste-user-uuid>', 'Owner', 'admin')
on conflict (id) do update
  set display_name = excluded.display_name,
      role = 'admin';
```

4. Verify:

```sql
select id, role from public.profiles where role = 'admin';
```

→ Admin pages (`/admin`, `/admin/products`, `/admin/inventory`,
`/admin/orders`, `/admin/delivery`) accept only signed-in users whose profile
role is `admin`. The app ships a `/login` page (email + password via Supabase
Auth); after creating the user above, sign in there to reach the admin area.

> Note: `profiles` uses row-level security. Migration `002` adds a
> `users can read own profile` SELECT policy so the login flow can read the
> role — do not remove it, or admin pages will redirect back to `/login`.

### 2.5 Customer accounts

1. **Authentication → Providers → Email**: keep Email enabled and turn
   **off** "Confirm email" so sign-ups are instant — the `handle_new_user`
   trigger from migration `005` creates the `profiles` row automatically.
2. **Authentication → SMTP**: for password-reset emails to arrive, configure
   the SMTP sender with your Gmail app password (Section 3). Until SMTP is
   set, "Forgot password" requests succeed but no email is delivered.
3. Shoppers use `/account` (sign up, sign in, profile, order history).
   Admins still use `/login`; migration `005` also blocks customers from
   self-promoting their own role to `admin`.

---

## 3. Gmail: app password

1. Enable **2-Step Verification** at `https://myaccount.google.com/security`.
   App passwords require it.
2. Open `https://myaccount.google.com/apppasswords`, pick **Mail** on this
   device, and create.
3. Copy the 16-character password (shown once) into your secret wallet. →
   `GMAIL_APP_PASSWORD`
4. `GMAIL_USER` and `GMAIL_FROM` = your sending address, e.g.
   `rosette.flowers@gmail.com`.

Gmail is for low-volume MVP mail (order confirmations). At higher volume it
throttles; if that happens, move the mailer to a paid SMTP provider.

---

## 4. Paymob: test mode

### 4.1 Dashboard keys

1. Create/enter the Paymob **Egypt** merchant dashboard.
2. **Account settings** → **API keys** — the dashboard shows test/live keys.
   Copy the **test** pair.
   - `PAYMOB_API_KEY` — server secret for creating intentions
   - `PAYMOB_PUBLIC_KEY` — used to build the hosted checkout URL
   - `PAYMOB_HMAC_SECRET` — signs transaction callbacks

3. **Integrations** → create a card payment integration in test mode →
   copy the **integration ID** → `PAYMOB_INTEGRATION_ID`.

`PAYMOB_BASE_URL` stays `https://accept.paymob.com` for both test and live:
Paymob switches test/live by the keys, not the domain.

### 4.2 Webhook / callback URL

The app sends callback and redirect URLs with every payment
(`POST /v1/intention` → `notification_url` / `redirection_url`) based on the
request's origin, so:

- **Local testing:** Paymob must reach `http://localhost:3000` — it cannot.
 Use a tunnel so the storefront and the callback share one public host:

   ```bash
   # terminal A — run the app
   npm run dev

   # terminal B — tunnel; cloudflared preferred (no account needed)
   cloudflared tunnel --url http://localhost:3000
   ```

   Browse the store **through the tunnel URL** (e.g.
   `https://rose-hour.trycloudflare.com`), so the app derives that URL as the
   callback origin and Paymob can call it back.

- **Production:** the real domain is used automatically, e.g.
  `https://shop.example.com/api/webhooks/paymob`.

Dashboard-level webhook settings are redundant here since the app passes the
URL per-intention, but keeping them in sync is harmless.

### 4.3 Test a payment

Paymob's dashboard lists the test card numbers (e.g. a Visa test card —
any future expiry and any CVV). After checkout you should land on the
hosted checkout, pay with the test card, and return to
`/orders/<id>?token=...`.

Only a verified callback (correct HMAC-SHA512 signature, matching amount,
new idempotency key) changes the order to `paid` — the browser redirect is
never payment authority.

---

## 5. Groq and WhatsApp

- **Groq:** `https://console.groq.com` → **API keys** → create → `GROQ_API_KEY`.
  Model defaults to `GROQ_MODEL=groq/compound-mini` (supports JSON output,
  which `/api/chat` requires). The key is server-only along with `/api/chat`.
- **WhatsApp:** `WHATSAPP_BUSINESS_NUMBER` = digits with country code,
  e.g. `201000000000` (Egypt). The first release only generates free
  `wa.me` handoff links — no Meta approval, no per-message cost.

---

## 6. `.env.local`

```bash
cp .env.example .env.local
```

| Variable | Value source |
| --- | --- |
| `DEPLOYMENT_RUNTIME` | `node` (local) or `cloudflare` (deployed); defaults to `node` |
| `PAYMENT_MODE` | `cod` (default), `paymob_test`, or `paymob_live` |
| `EMAIL_DELIVERY_MODE` | `smtp` (Node/Gmail) or `disabled` (Cloudflare default) |
| `SITE_URL` | public origin, e.g. `https://rosette.<account>.workers.dev` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| `PAYMOB_API_KEY` | Paymob → Account settings → API keys (test) |
| `PAYMOB_PUBLIC_KEY` | Paymob → Account settings → API keys (test) |
| `PAYMOB_INTEGRATION_ID` | Paymob → Integration (test) |
| `PAYMOB_HMAC_SECRET` | Paymob → Account settings → HMAC |
| `PAYMOB_BASE_URL` | leave `https://accept.paymob.com` |
| `GMAIL_USER` | your sending Gmail |
| `GMAIL_APP_PASSWORD` | the new app password (16 chars, with spaces removed) |
| `GMAIL_FROM` | same as `GMAIL_USER` for now |
| `EMAIL_PREFERENCES_SECRET` | a random server-only secret for signed engagement-email unsubscribe links |
| `GIFT_CARD_SECRET` | a random server-only secret used to hash/encrypt digital gift-card codes |
| `GROQ_API_KEY` | Groq console |
| `GROQ_MODEL` | `groq/compound-mini` (default) |
| `WHATSAPP_BUSINESS_NUMBER` | e.g. `201000000000` |
| `CRON_SECRET` | a random string shared with your scheduler (e.g. `openssl rand -hex 32`) |
| `NOTIFICATION_RETRY_MAX_ATTEMPTS` | optional; retry attempt cap (default `3`) |
| `NOTIFICATION_RETRY_STALE_PENDING_MINUTES` | optional; stale-`pending` window in minutes (default `15`) |

`.env.local` is git-ignored. Keep a second copy for the deployment host and
never paste these values in chat, issues, or commits.

---

## 7. End-to-end verification (test mode)

```bash
npm run dev
```

> By default `PAYMENT_MODE=cod`: checkout places a `pending` Cash-on-Delivery
> order and never opens Paymob. Steps 2–4 below describe the opt-in
> `PAYMENT_MODE=paymob_test` flow; set that mode and the four Paymob test keys
> first to run them.

1. Open the store (via tunnel for payment tests) and add products to the bag.
2. Checkout → pick Greater Cairo → submit. For COD, expect the confirmation
   page with a `pending` payment status and no hosted checkout. For Paymob
   test mode, the Paymob hosted page opens.
3. (Paymob test only) Complete payment with the Paymob test card.
4. (Paymob test only) You land on `/orders/<id>?token=...` with payment status
   **paid**. COD orders stay `pending` until confirmed in `/admin/orders`.
5. Verify the database, in the **Supabase SQL Editor**:

   ```sql
   select display_number, payment_status, fulfillment_status, subtotal_minor,
          delivery_fee_minor, total_minor
   from public.orders order by created_at desc limit 5;

   select id, order_id, status, provider_reference from public.payments
   order by created_at desc limit 5;

   select order_id, event_type, from_status, to_status
   from public.order_events order by created_at desc limit 5;
   ```

   `delivery_fee_minor` should match the city's rule (e.g. `7500` for Greater
   Cairo), not the old flat `1500`.

6. Check the buyer's inbox for the bilingual confirmation email.
7. Test the failure path: decline card → order stays `payment_failed`, stock
   is released.
8. Test the guardrails: ask the chat widget something off-topic → refusal;
   ask a real store question in Arabic or English → grounded answer.
9. Admin: sign in (see 2.4) → `/admin/orders` → move an order through
   `preparing → out_for_delivery → delivered` → the `order_events` rows above
   record each transition.
10. Configure the retry cron (see "Retry job" in
    `docs/operations/payments-email-chat.md`) and trigger it once manually;
    stuck `notification_deliveries` rows move to `sent`/`failed`.

---

## 8. Deploy to Cloudflare Workers (OpenNext)

The app deploys to Cloudflare Workers through `@opennextjs/cloudflare` and
Wrangler. `wrangler.jsonc` points at the generated worker; application secrets
are stored as Cloudflare secrets, never in the repo.

### 8.1 One-time setup

1. Create a Cloudflare account and, in **Workers & Pages**, note your
   **Account ID**.
2. Create an API token with the **Edit Cloudflare Workers** template
   (`https://dash.cloudflare.com/profile/api-tokens`).
3. Add four repository secrets under
   **GitHub → Settings → Secrets and variables → Actions**:
   - `CLOUDFLARE_API_TOKEN` — the token above
   - `CLOUDFLARE_ACCOUNT_ID` — the account ID
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your Supabase anon (public) key

   The two `NEXT_PUBLIC_*` values are **public** by design and are inlined into
   the client bundle at build time, so the CI build needs them as build-time
   environment; they never leave your app as server-side secrets.

### 8.2 Application secrets (Cloudflare)

Set every runtime secret with Wrangler (or the Workers dashboard) — never in
`wrangler.jsonc` or the repo. These are injected as Cloudflare bindings at
runtime, so a rebuilt worker never bakes them into its bundle:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put EMAIL_PREFERENCES_SECRET
npx wrangler secret put GIFT_CARD_SECRET
npx wrangler secret put CRON_SECRET
npx wrangler secret put SITE_URL
# Paymob test mode only — omit these to keep COD as the only payment path:
npx wrangler secret put PAYMOB_API_KEY
npx wrangler secret put PAYMOB_PUBLIC_KEY
npx wrangler secret put PAYMOB_INTEGRATION_ID
npx wrangler secret put PAYMOB_HMAC_SECRET
npx wrangler secret put PAYMOB_BASE_URL
```

### 8.3 Modes

Non-secret mode switches are declared in `wrangler.jsonc` under `vars` (so the
Worker always boots with the correct $0 defaults even if a secret is missing):

| Variable | Default | Notes |
| --- | --- | --- |
| `DEPLOYMENT_RUNTIME` | `cloudflare` on Workers | use `node` for local dev |
| `PAYMENT_MODE` | `cod` | `paymob_test` opt-in; `paymob_live` requires explicit set + keys |
| `EMAIL_DELIVERY_MODE` | `disabled` on Workers | Gmail SMTP is Node-only; orders still save when email is off |

To opt into Paymob test mode or SMTP email, set the matching `PAYMENT_MODE` /
`EMAIL_DELIVERY_MODE` value in `wrangler.jsonc` `vars` (a code change you
commit), or override it with a same-named Cloudflare secret.

- **COD / manual payment** is the real-order path at $0. It creates a
  `pending` order and never calls Paymob.
- **Paymob test mode** works only when `PAYMENT_MODE=paymob_test` and all four
  Paymob keys are set. Live card payments carry a processor fee and are not
  enabled by default.
- **Email** is failure-safe. On Cloudflare, `EMAIL_DELIVERY_MODE` defaults to
  `disabled`: orders, gift cards, and notification rows still record their
  state, and the admin can see/retry notification status. To send mail, run a
  Node deployment with `EMAIL_DELIVERY_MODE=smtp`.

### 8.4 Deploy

Pushing to `master` runs `.github/workflows/deploy-cloudflare.yml`: install,
`npm test`, `npm run lint`, `npm run cf:build` (OpenNext build + worker-size
gate), then `npx wrangler deploy`. The storefront is served from
`https://rosette.<account>.workers.dev` (the `workers.dev` subdomain).

### 8.5 Email retry scheduler

Add two more repository secrets and run the workflows once manually:

- `CRON_ENDPOINT` — `https://rosette.<account>.workers.dev/api/cron/notifications`
- `CRON_SECRET` — the same random string set in Cloudflare

Open the **Actions** tab, run "Retry stuck email notifications", then "Smoke
test cron endpoint" (pass the deployed URL via the `url` input) to confirm the
401 guard and summary response.

---

## 9. Go live with Paymob

1. In Paymob, switch the integration to **live** and complete any
   verification (KYC, business docs).
2. Replace the four Paymob env values with the **live** API key, public key,
   integration ID, and HMAC secret — in both `.env.local` and the host.
3. Run a real 1 EGP (or equivalent minimal) payment end to end and confirm
   the order becomes `paid` with the live callback.
4. Daily operational checks: orders table, `admin_audit_logs`, email
   delivery, Groq rate limit usage.
5. Approving a cancellation of a **paid** order calls the Paymob refund API
   automatically (full amount, same payment method). If the refund call fails,
   the approval is blocked — the request stays pending and the order stays
   `paid` — so retry the approval later; verify in the Paymob dashboard that
   the money reaches the customer.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Shop still shows the 16 mock products | `NEXT_PUBLIC_*` vars missing → restart dev server |
| Checkout errors `Checkout is temporarily unavailable` | Supabase reachability; check service-role key; city code in the cart not in `cities` → re-run seed |
| Paymob page opens but no callback arrives | Local origin — use the tunnel (Section 4.2); check `accept.paymob.com/v1/intention` request succeeded |
| Callback returns 401 / order stays pending | `PAYMOB_HMAC_SECRET` mismatch or amount mismatch — compare fields, restart |
| Order double-credited | Idempotency: `payments.idempotency_key` unique treats duplicates as no-ops by design |
| Gmail emails not arriving | Wrong app password (regenerate), Gmail quota, or spam folder |
| Chat refuses everything | Topic guard is strict; ask only store questions (products, delivery, order status) |
| Admin pages deny access | `profiles.role` not `admin` or no Supabase session — sign in at `/login`; if the profiles RLS policy from migration `002` is missing, re-push it |

---

## Final security checklist before real money

- [ ] `.env.local` and host dashboard are the only places with secrets
- [ ] Supabase service-role key never shipped in client code or commits
- [ ] RLS enabled on every customer table (migration sets it — confirm in
      **Authentication → Policies**)
- [ ] Paymob `total_minor` stored server-side; callback amount verified
- [ ] Admin role audit: only your user is `admin`
- [ ] A revocation path exists: Gmail app password and Groq key were
      regenerable, and rotation steps are documented