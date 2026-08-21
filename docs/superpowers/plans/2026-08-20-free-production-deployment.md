# Rosette free production deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unsupported Fly.io deployment path with a Cloudflare Workers/OpenNext production deployment that supports real COD/manual orders at zero required software cost.

**Architecture:** Keep Supabase, its migrations/RLS/RPCs, and the existing provider boundaries. Add explicit runtime, payment, and email modes; use COD/manual payment by default, Paymob test mode only when explicitly enabled, and a disabled email adapter for Cloudflare when SMTP is unavailable. Deploy the Next.js Node runtime through `@opennextjs/cloudflare`, Wrangler, and GitHub Actions.

**Tech Stack:** Next.js 16.3.1 App Router, React 19, TypeScript, Supabase SSR/Auth, OpenNext Cloudflare adapter, Wrangler, GitHub Actions, Vitest, existing Nodemailer adapter for Node deployments.

**Spec:** `docs/superpowers/specs/2026-08-20-free-production-deployment-design.md`

## Global Constraints

- Fly.io is removed from the supported deployment path and repository configuration only after Cloudflare verification passes.
- Cloudflare Workers with `@opennextjs/cloudflare` is the target runtime; the older Pages adapter is not used.
- Real zero-cost orders use Cash on Delivery/manual payment; Paymob test mode is opt-in and live card payments are not enabled by default.
- Email failure or disabled email must never invalidate an order or gift-card activation.
- Existing Supabase migrations, RLS, Auth, Storage, atomic gift-card RPCs, Paymob HMAC checks, and local fallback behavior remain intact.
- Secrets remain in `.env.local`, Cloudflare secrets, or GitHub secrets; never in source, logs, or client components.
- Optional Turnstile, Cloudflare Analytics, UptimeRobot, automated backups, and an HTTPS email provider are follow-up work and do not block this plan.
- Verification commands must use provider-independent test isolation; the existing `.env.local` Groq key must not make `tests/lib/server-env.test.ts` fail.

---

### Task 1: Add explicit runtime, payment, and email mode boundaries

**Files:**
- Modify: `lib/server-env.ts`
- Modify: `.env.example`
- Create: `lib/runtime-config.ts`
- Create: `tests/lib/runtime-config.test.ts`
- Modify: `tests/lib/server-env.test.ts` only to isolate dotenv-backed optional values

**Interfaces:**
- `getDeploymentRuntime(): 'cloudflare' | 'node'` defaults to `'node'` locally.
- `getPaymentMode(): 'cod' | 'paymob_test' | 'paymob_live'` defaults to `'cod'`.
- `getEmailDeliveryMode(): 'disabled' | 'smtp'` defaults to `'smtp'` for `node` and `'disabled'` for `cloudflare`.
- `isPaymobEnabled(): boolean` returns true only for `paymob_test`/`paymob_live` and complete Paymob configuration.
- Invalid mode values return safe defaults or a stable configuration error; they must not silently enable live payments.

- [ ] **Step 1: Write failing configuration tests.**

```ts
it('defaults production-safe modes without provider configuration', () => {
  vi.stubEnv('DEPLOYMENT_RUNTIME', 'cloudflare');
  vi.stubEnv('PAYMENT_MODE', '');
  vi.stubEnv('EMAIL_DELIVERY_MODE', '');
  expect(getPaymentMode()).toBe('cod');
  expect(getEmailDeliveryMode()).toBe('disabled');
  expect(isPaymobEnabled()).toBe(false);
});

it('never treats an invalid payment mode as live payment', () => {
  vi.stubEnv('PAYMENT_MODE', 'live');
  expect(getPaymentMode()).toBe('cod');
  expect(isPaymobEnabled()).toBe(false);
});

it('allows explicit Paymob test mode only when all Paymob values exist', () => {
  vi.stubEnv('PAYMENT_MODE', 'paymob_test');
  vi.stubEnv('PAYMOB_API_KEY', 'test');
  vi.stubEnv('PAYMOB_PUBLIC_KEY', 'test');
  vi.stubEnv('PAYMOB_INTEGRATION_ID', '1');
  vi.stubEnv('PAYMOB_HMAC_SECRET', 'test');
  expect(isPaymobEnabled()).toBe(true);
});
```

Add `afterEach(() => vi.unstubAllEnvs())` and test `GROQ_API_KEY`/other optional values with `vi.stubEnv(key, '')` so `.env.local` does not make the test order-dependent.

- [ ] **Step 2: Run the focused tests and confirm RED.**

Run: `npm test -- --run tests/lib/runtime-config.test.ts tests/lib/server-env.test.ts`

Expected: the new module/functions are missing and the mode tests fail.

- [ ] **Step 3: Implement the configuration boundary.**

Add the three env keys to `serverKeys` and `.env.example` with safe defaults. Use `getOptionalServerEnv` for values and a fixed allowlist for each mode. `isPaymobEnabled` must require all four existing Paymob keys and must not consider `paymob_live` valid for the strict zero-cost default unless `PAYMENT_MODE=paymob_live` is explicitly set.

- [ ] **Step 4: Run the focused tests and typecheck.**

Run: `npm test -- --run tests/lib/runtime-config.test.ts tests/lib/server-env.test.ts && npm run lint`

Expected: focused tests pass and TypeScript is clean.

- [ ] **Step 5: Commit the configuration boundary.**

```bash
git add lib/runtime-config.ts lib/server-env.ts .env.example tests/lib/runtime-config.test.ts tests/lib/server-env.test.ts
git commit -m "feat: add production-safe runtime modes"
```

---

### Task 2: Make checkout and payment selection honor safe modes

**Files:**
- Modify: `features/checkout/CheckoutForm.tsx`
- Modify: `features/checkout/types.ts`
- Modify: `app/api/orders/route.ts`
- Test: `tests/routes/orders.test.ts`- Create: `tests/components/CheckoutForm.test.tsx`
 or the existing checkout component test location

**Interfaces:**
- Add a server-side `getAvailablePaymentMethods()` or equivalent mode-aware result consumed by the checkout UI.
- COD/manual orders return an order with `paymentStatus: 'pending'` and never call `createPaymobIntention`.
- Paymob intention creation is allowed only when `isPaymobEnabled()` is true.
- Existing demo-card behavior remains local-only and does not become a live payment path.

- [ ] **Step 1: Write failing route tests.**

```ts
it('creates a COD order without calling Paymob when payment mode is cod', async () => {
  vi.stubEnv('PAYMENT_MODE', 'cod');
  const response = await POST(requestWithCheckout({ paymentMethod: 'pay-on-delivery' }));
  expect(response.status).toBe(201);
  expect(createPaymobIntention).not.toHaveBeenCalled();
  expect(await response.json()).toMatchObject({ paymentStatus: 'pending', checkoutUrl: null });
});

it('rejects a Paymob checkout when Paymob is not explicitly enabled', async () => {
  vi.stubEnv('PAYMENT_MODE', 'cod');
  const response = await POST(requestWithCheckout({ paymentMethod: 'paymob' }));
  expect(response.status).toBe(409);
  expect(createPaymobIntention).not.toHaveBeenCalled();
});
```

Add a component assertion that COD is visible and Paymob is hidden or disabled when the server mode is `cod`.

- [ ] **Step 2: Run the focused tests and confirm RED.**

Run: `npm test -- --run tests/routes/orders.test.ts tests/components/purchase-flow.test.tsx`

Expected: the existing route always follows the Paymob branch or the UI still offers Paymob, so the new assertions fail.

- [ ] **Step 3: Implement mode-aware checkout.**

Have the page/server boundary expose the available payment methods without exposing server secrets. In `/api/orders`, evaluate the configured mode before intention creation. For COD/manual, preserve order creation, notification behavior, inventory reservation, and pending payment state, but return no checkout URL. For disabled Paymob, return a stable configuration error instead of attempting provider calls. Never mark COD orders paid automatically.

- [ ] **Step 4: Run focused order tests and the full order regression set.**

Run: `npm test -- --run tests/routes/orders.test.ts tests/domain/order-insert.test.ts tests/domain/checkout-gift-card.test.ts && npm run lint`

Expected: COD and Paymob guard tests pass; existing gift-card/Paymob order tests remain green.

- [ ] **Step 5: Commit the payment-mode boundary.**

```bash
git add features/checkout features/order app/api/orders/route.ts tests/routes/orders.test.ts tests/components/purchase-flow.test.tsx
 git commit -m "feat: support production-safe manual payment mode"
```

---

### Task 3: Make email delivery safe on Cloudflare and preserve Node SMTP

**Files:**
- Modify: `features/notifications/gmail-mailer.ts`
- Modify: `features/notifications/notification-service.ts`
- Modify: `features/gift-cards/purchase-email.ts`
- Modify: `features/cart/abandoned-email.ts`
- Modify: `features/wishlist/email.ts`
- Modify: `features/notifications/notification-delivery.ts` if status mapping belongs there
- Create: `features/notifications/disabled-mailer.ts`
- Test: `tests/domain/notification-delivery.test.ts`
- Test: `tests/domain/gift-card-purchase-email.test.ts`
- Test: `tests/domain/abandoned-email.test.ts`
- Test: `tests/domain/wishlist-cron.test.ts`

**Interfaces:**
- `createMailTransport()` returns the existing Gmail transport for `EMAIL_DELIVERY_MODE=smtp` and a disabled transport for `EMAIL_DELIVERY_MODE=disabled`.
- Disabled transport returns a typed `{ delivered: false; reason: 'disabled' }` result or the existing notification service equivalent; it must not throw.
- Existing injected test transports continue to work.

- [ ] **Step 1: Write failing disabled-delivery tests.**

```ts
it('does not attempt SMTP when email delivery is disabled', async () => {
  vi.stubEnv('DEPLOYMENT_RUNTIME', 'cloudflare');
  vi.stubEnv('EMAIL_DELIVERY_MODE', 'disabled');
  const transport = createMailTransport();
  await expect(transport.sendMail(message)).resolves.toMatchObject({ delivered: false, reason: 'disabled' });
});

it('keeps a gift card active when delivery is disabled', async () => {
  vi.stubEnv('EMAIL_DELIVERY_MODE', 'disabled');
  const result = await activateGiftCardPurchase(client, transaction, { secret: 'test-secret' });
  expect(result).toMatchObject({ handled: true, status: 'activated' });
  expect(insertedCard.balance_minor).toBe(100000);
});
```

Update notification expectations to distinguish disabled from SMTP failure without changing order state.

- [ ] **Step 2: Run focused tests and confirm RED.**

Run: `npm test -- --run tests/domain/notification-delivery.test.ts tests/domain/gift-card-purchase-email.test.ts tests/domain/abandoned-email.test.ts tests/domain/wishlist-cron.test.ts`

Expected: current code creates Gmail transports or treats disabled delivery as an exception.

- [ ] **Step 3: Implement the disabled transport and mode wiring.**

Centralize transport construction. Do not import or instantiate Nodemailer in the Cloudflare-disabled path. Keep direct renderer tests pure. Ensure notification rows record a stable disabled/skipped outcome and retry cron does not endlessly retry intentionally disabled sends. Keep gift-card activation/value and admin operations safe when delivery is disabled; admin resend returns a clear unavailable result.

- [ ] **Step 4: Run focused email tests and full notification regressions.**

Run: `npm test -- --run tests/domain/notification-delivery.test.ts tests/domain/gift-card-service.test.ts tests/domain/gift-card-purchase-email.test.ts tests/domain/abandoned-cron.test.ts tests/domain/wishlist-cron.test.ts && npm run lint`

Expected: disabled and SMTP paths pass, with no changes to transactional order state semantics.

- [ ] **Step 5: Commit the email runtime boundary.**

```bash
git add features/notifications features/gift-cards/purchase-email.ts features/cart/abandoned-email.ts features/wishlist/email.ts tests/domain/notification-delivery.test.ts tests/domain/gift-card-purchase-email.test.ts tests/domain/abandoned-email.test.ts tests/domain/wishlist-cron.test.ts
 git commit -m "feat: make email delivery optional by runtime"
```

---

### Task 4: Add OpenNext Cloudflare and Wrangler deployment configuration

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `open-next.config.ts`
- Create: `wrangler.jsonc`
- Create: `scripts/check-worker-size.mjs`
- Create: `tests/deployment/cloudflare-config.test.ts`
- Modify: `next.config.ts` to keep the existing Next.js/OpenNext-compatible image and build settings

**Interfaces:**
- `npm run cf:build` runs the normal Next production build through OpenNext.
- `npm run cf:preview` starts Wrangler local preview against the generated Worker.
- `npm run cf:deploy` deploys only through Wrangler and requires Cloudflare authentication.
- `scripts/check-worker-size.mjs` exits nonzero when the compressed Worker artifact exceeds the configured Free-plan threshold.

- [ ] **Step 1: Add a failing configuration test.**

```ts
it('defines a Cloudflare deployment with a public workers.dev-compatible name', async () => {
  const config = await readFile('wrangler.jsonc', 'utf8');
  expect(config).toContain('main');
  expect(config).toContain('workers_dev');
  expect(config).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|PAYMOB_API_KEY|GMAIL_APP_PASSWORD/);
});
```

- [ ] **Step 2: Run it to confirm RED.**

Run: `npm test -- --run tests/deployment/cloudflare-config.test.ts`

Expected: configuration files do not exist.

- [ ] **Step 3: Install and configure OpenNext.**

Use the existing npm package manager:

```bash
npm install --save-dev @opennextjs/cloudflare wrangler
```

Add a minimal OpenNext config and Wrangler config with a stable worker name, `workers_dev: true`, compatibility date, `nodejs_compat` compatibility flag, and no secret values. Put runtime secrets in Cloudflare dashboard/secret storage, not `wrangler.jsonc`.

Add scripts:

```json
{
  "cf:build": "opennextjs-cloudflare build && node scripts/check-worker-size.mjs",
  "cf:preview": "wrangler dev",
  "cf:deploy": "npm run cf:build && wrangler deploy"
}
```

Use the adapter's documented generated output rather than hand-copying `.next` files.

- [ ] **Step 4: Run the configuration test and local build.**

Run: `npm test -- --run tests/deployment/cloudflare-config.test.ts && npm run cf:build`

Expected: the config test passes and the OpenNext artifact builds; if the Worker exceeds the free limit, the size script fails with the measured compressed size.

- [ ] **Step 5: Run Wrangler preview checks.**

Run: `npm run cf:preview` in a background process, then use the existing test/request harness to verify `/`, a localized route, `/api/email-preferences/unsubscribe`, `/api/admin/gift-cards` authorization, and `/api/orders` configuration behavior. Stop the preview after checks.

- [ ] **Step 6: Commit the Cloudflare deployment foundation.**

```bash
git add package.json package-lock.json open-next.config.ts wrangler.jsonc scripts/check-worker-size.mjs tests/deployment/cloudflare-config.test.ts next.config.ts
git commit -m "feat: add Cloudflare Workers deployment"
```

---

### Task 5: Replace Fly deployment with GitHub Actions Cloudflare deployment

**Files:**
- Create: `.github/workflows/deploy-cloudflare.yml`
- Modify: `.github/workflows/cron-notifications.yml`
- Modify: `.github/workflows/smoke-cron.yml`
- Modify: `docs/setup/runbook.md`
- Modify: `docs/operations/payments-email-chat.md`
- Delete after verification: `fly.toml`

**Interfaces:**
- Pushes to `master` run tests, typecheck, OpenNext build/size check, and deploy through Wrangler.
- Deployment requires only GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; application secrets are configured in Cloudflare, not the workflow file.
- Retry cron uses a configured `CRON_ENDPOINT` pointing to the Cloudflare URL.
- Smoke workflow supports a supplied URL and never contains a hard-coded private endpoint.

- [ ] **Step 1: Write a workflow/config regression test.**

Assert the deployment workflow includes `npm run cf:build`, Cloudflare secrets, and no Fly commands; assert cron workflows still use GitHub secrets for endpoint and bearer token.

- [ ] **Step 2: Run it to confirm RED.**

Run: `npm test -- --run tests/deployment/cloudflare-config.test.ts`

Expected: the deploy workflow does not exist and Fly remains the only deployment configuration.

- [ ] **Step 3: Add the Cloudflare workflow.**

Use a pinned Node setup and npm cache, run `npm ci`, `npm test` with provider-independent env isolation, `npm run lint`, `npm run cf:build`, then `npx wrangler deploy`. Pass `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from GitHub secrets only. Do not echo environment values.

- [ ] **Step 4: Update operational documentation.**

Document:

- Cloudflare Workers setup and `workers.dev` URL.
- Cloudflare secrets and environment modes.
- `PAYMENT_MODE=cod` as the zero-cost production default.
- Paymob test-only behavior and the unavoidable live transaction fee.
- `EMAIL_DELIVERY_MODE=disabled` behavior and the Node/Gmail alternative.
- Supabase migration state and RLS/RPC verification SQL.
- GitHub Actions deployment and notification cron secrets.
- Manual/COD admin payment confirmation rules.
- Free-tier quota and rollback guidance.

- [ ] **Step 5: Verify Cloudflare deployment before removing Fly.**

Run all local gates:

```bash
npm test
npm run lint
npm run build
npm run cf:build
git diff --check
```

Then perform a manual Cloudflare preview/deployment smoke check. Confirm the deployment URL, localized routing, Supabase auth cookies, COD order creation, admin guard, gift-card route, and unsubscribe route. Only after those checks pass remove `fly.toml` and all Fly-specific runbook references.

- [ ] **Step 6: Commit and push the deployment migration.**

```bash
git add .github/workflows/deploy-cloudflare.yml .github/workflows/cron-notifications.yml .github/workflows/smoke-cron.yml docs/setup/runbook.md docs/operations/payments-email-chat.md fly.toml
 git commit -m "feat: move production deployment to Cloudflare"
 git push origin master
```

---

## Final verification checklist

- [ ] `PAYMENT_MODE=cod` is the safe default and COD orders never call Paymob.
- [ ] Paymob test mode requires explicit configuration; browser redirects never mark orders paid.
- [ ] Cloudflare production does not attempt raw Gmail SMTP when email mode is disabled.
- [ ] Paid gift cards remain valid when email is disabled or fails.
- [ ] Existing Supabase migrations/RLS/RPCs remain synchronized.
- [ ] OpenNext build succeeds and Worker size is below the free limit.
- [ ] Cloudflare preview serves representative public, API, and admin-guard routes.
- [ ] GitHub Actions deploy and cron workflows contain no secrets.
- [ ] Fly.io configuration is removed only after Cloudflare verification.
- [ ] `npm test`, `npm run lint`, `npm run build`, `npm run cf:build`, and `git diff --check` pass.
- [ ] Optional Turnstile, analytics, monitoring, backups, and HTTPS email are documented as later work rather than silently assumed free.
