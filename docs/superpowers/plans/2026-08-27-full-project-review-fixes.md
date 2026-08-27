# Full Project Review — Fix Plan (2026-08-27)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the uncommitted hardening work cleanly and fix the review findings (CI-blocking lint error, Sentry PII hygiene, docs drift) without changing any verified-passing behavior.

**Architecture:** Small, independent fixes. The project already passes 1110 tests + production build; every task below is additive and gated by the existing pipeline (same commands CI runs: `npm test`, `npm run lint`, `npm run build`).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest + Testing Library, @sentry/nextjs, Cloudflare Workers (OpenNext).

**Spec:** Findings of the 2026-08-27 full project review (UI/UX, features, security, performance) captured in the same session.

## Global Constraints

- All customer-facing copy goes through the i18n dictionary (EN/AR/FR) — no hardcoded strings.
- Server-only env access only via `lib/server-env.ts` allowlist; never `process.env` directly in app code.
- Logging via `logger` from `lib/logger.ts` — never `console.*` in app code.
- Tests use fakes/injection — no network calls; `RESEND_API_KEY` must stay unset in `tests/setup.ts`.
- Do not enable Turnstile/Sentry/Resend behavior when their env vars are absent (feature-flag-by-env pattern).
- Run `npm test` and `npm run lint` after every task; both must pass (this is the CI gate).

---

### Task 1 (P0 — CI blocker): Fix `react-hooks/refs` lint error in TurnstileWidget

**Files:**
- Modify: `components/security/TurnstileWidget.tsx:38-39`
- Test: `tests/components/TurnstileWidget.test.tsx` (existing — must keep passing)

**Context:** `npm run lint` currently fails with `react-hooks/refs: Cannot update ref during render` because `callbacksRef.current = { onVerify, onExpire, onError }` executes during render. The deploy workflow runs `npm run lint` before deploying, so the uncommitted state cannot ship.

**Interfaces:**
- Produces: unchanged public props `{ siteKey, onVerify, onExpire, onError, theme, size }`; callbacks kept fresh via a ref synced inside `useEffect`.

- [ ] **Step 1: Remove the render-time ref write and sync it in an effect**

Replace lines 38–39:

```tsx
  const callbacksRef = useRef({ onVerify, onExpire, onError });
  callbacksRef.current = { onVerify, onExpire, onError };
```

with:

```tsx
  // Keep latest callbacks in a ref so the widget isn't torn down and re-created
  // every time CheckoutForm re-renders (inline arrows = new refs each render).
  // Only siteKey/theme/size changes should re-render the widget. The ref is
  // synced in an effect (never during render) to satisfy react-hooks/refs.
  const callbacksRef = useRef({ onVerify, onExpire, onError });
  useEffect(() => {
    callbacksRef.current = { onVerify, onExpire, onError };
  });
```

The render callback already closes over `callbacksRef` and reads `.current` at call time, so the latest callbacks are used once Turnstile fires (effects run before any user interaction can trigger a callback).

- [ ] **Step 2: Verify lint and tests pass**

Run: `npm run lint && npx vitest run tests/components/TurnstileWidget.test.tsx`
Expected: 0 lint errors; widget tests PASS.

- [ ] **Step 3: Commit the entire pending hardening changeset**

The widget fix unblocks landing the whole uncommitted batch (Turnstile verify route + widget, Sentry, CF analytics, Resend mailer, husky). One commit keeps the deploy workflow green:

```bash
git add -A
git commit -m "feat: harden runtime with turnstile, sentry, analytics and resend mailer"

---

### Task 2 (P1): Sentry PII hygiene

**Files:**
- Modify: `sentry.client.config.ts`
- Modify: `sentry.server.config.ts`

**Context:** Client `beforeSend` returns the event unchanged with a misleading comment ("logger.ts already redacts" — the logger is server-side and unrelated). Make PII intent explicit and scrub obvious identifiers; `sendDefaultPii` defaults to false but should be stated so intent survives upgrades.

**Interfaces:**
- Produces: no code-facing interface change; only Sentry event posture.

- [ ] **Step 1: Client config — explicit PII off + scrub user identifiers**

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Free tier: 5k errors/mo. Sample 10% perf, 100% in dev.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend(event) {
    // Defense in depth: error replays can capture DOM text; also strip any
    // user identifiers that may attach to events.
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
    }
    return event;
  },
});
```

- [ ] **Step 2: Server config — match the client posture**

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
});
```

- [ ] **Step 3: Run checks and commit**

Run: `npm run lint && npm run build`
Expected: PASS (config-only change).

```bash
git add sentry.client.config.ts sentry.server.config.ts
git commit -m "chore(sentry): make PII posture explicit and scrub user identifiers"
```

---

### Task 3 (P1): Go-live switches checklist for worker vars


---

### Task 4 (P2): Refresh stale docs + stray file

**Files:**
- Modify: `README.md` (Routes section)
- Delete: `docs/superpowers/plans/test.txt`

**Context:** README documents `/shop`, `/cart`, `/checkout` — the actual routes are `/[locale]/[city]/shop`, `/[locale]/[city]/cart`, `/[locale]/[city]/checkout` (plus `/track`, `/wishlist`, `/gift-cards`, `/blog`, `/account/*`, and the role-gated `/admin/*`).

- [ ] **Step 1: Update the README route map** to the real, live routes — keep the same concise tone, explain the `/{locale}/{city}/…` prefix (locale: `en|ar|fr`, city slug) and note `/admin` requires an `admin`/`operator` profile role.
- [ ] **Step 2:** `git rm docs/superpowers/plans/test.txt`
- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: refresh route map and remove stray plan file"
```

---

### Task 5 (P2 — optional, only if chat/review spam is observed): Extend Turnstile beyond checkout

**Files:**
- Modify: `app/api/chat/route.ts` + chat widget component
- Modify: `app/api/account/products/[slug]/reviews/route.ts` + `features/reviews/ReviewForm.tsx`

**Context:** Turnstile is enforced only on `/api/orders`; chat and review submission rely on rate limits alone. The reusable gate is `checkTurnstileToken(token, secret, ip)` from `lib/turnstile.ts`, which passes when `TURNSTILE_SECRET_KEY` is unset — keep that env-gated behavior.

**Interfaces:**
- Consumes: `checkTurnstileToken(token: unknown, secret: string | undefined, remoteIp?: string): Promise<'pass' | 'missing' | 'invalid'>`.
- Produces: same 3-state handling as `app/api/orders/route.ts:27-30`.

- [ ] **Step 1:** Thread an optional `turnstileToken` through both client flows, rendering `TurnstileWidget` only when a site key is passed down, mirroring the checkout pattern (`CheckoutForm.tsx:449-451`).
- [ ] **Step 2:** Add route tests asserting: secret unset → pass; secret set + missing token → 400 "Human verification required"; invalid token → 400 "Human verification failed".
- [ ] **Step 3:** Run `npm test && npm run lint`, then commit.

---

### Task 6 (P3 — hardening backlog): Replace `md5(random()::text)` public tokens with `gen_random_uuid()`

**Files:**
- Modify: `supabase/migrations/024_create_pending_order.sql` (and a new healing migration for the deployed function, e.g. `033_order_public_token_csp.sql`)
- Test: `tests/domain/create-pending-order-migration.test.ts:45-46` (currently expects `md5(random()::text)`)

**Context:** Order status URLs are guarded by `orders.public_token`, generated inside the `create_pending_order` RPC as `md5(random()::text)`. Postgres `random()` is not a CSPRNG, so tokens are weaker than they look. `gen_random_uuid()` is built-in (PG13+) and crypto-grade. Existing rows keep working — only new orders get the stronger token.

- [ ] **Step 1: Update the failing test** to expect `gen_random_uuid()::text` where the migration currently uses `md5(random()::text)`.
- [ ] **Step 2: Run it** (`npx vitest run tests/domain/create-pending-order-migration.test.ts`) — expect FAIL against the current migration.
- [ ] **Step 3: Update the migration + add the healing migration** replacing the expression, following the repo's existing migration-edit + migration-test pattern (see `tests/domain/apply-change-to-order-migration.test.ts`).
- [ ] **Step 4: Run the full suite** `npm test && npm run lint`, then commit.

---

## Non-code findings recorded (no task — accepted/documented)

1. **CSP `script-src 'unsafe-inline'` in production** — required because there is no middleware on OpenNext/Cloudflare to inject nonces, and Next.js + the locale-sync bootstrap use inline scripts. Revisit only if a nonce mechanism becomes viable on Workers.
2. **`getClientIp` trusts `X-Forwarded-For` when `CF-Connecting-IP` is absent** — safe on the Cloudflare runtime (edge always sets it); only spoofable if the app is ever hosted off-Cloudflare.
3. **In-memory rate-limit fallback is per-isolate** — by design; fixed operationally by setting the Upstash vars (Task 3 checklist).
4. **`/api/orders/[id]` response hardcodes `method: 'paymob'`** — cosmetic; fold into any future touch of that file.
5. **`.turnstile-widget` has no CSS rule** — Turnstile renders its own iframe inside the div, so no breakage; add spacing/margin styling when polishing checkout.

**Files:**
- Modify: `docs/setup/runbook.md` (append a short section)

**Context:** `wrangler.jsonc` ships `PAYMENT_MODE: "cod"` and `EMAIL_DELIVERY_MODE: "disabled"`. Review found this is easy to miss at go-live: online payment and order emails are OFF for the deployed worker unless changed via Cloudflare bindings/vars.

**Interfaces:**
- Consumes: `features/checkout/payment-mode.ts` — confirm the exact accepted `PAYMENT_MODE` values from that file before saving (the runbook text below must match them).

- [ ] **Step 1: Add the section**

```markdown
## 9. Go-live switches (worker vars)

The committed `wrangler.jsonc` defaults are intentionally safe for demos.
Before announcing real traffic, verify these in the Cloudflare dashboard
(Workers → rosette → Settings → Variables) or via `wrangler secret put`:

| Var | Committed default | Go-live value |
| --- | --- | --- |
| `PAYMENT_MODE` | `cod` | value that enables Paymob (see `features/checkout/payment-mode.ts`) |
| `EMAIL_DELIVERY_MODE` | `disabled` | `smtp` (Gmail) or `resend` |
| `TURNSTILE_SECRET_KEY` | unset | set to enforce checkout bot protection |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | unset | set for cross-isolate rate limits |

Never commit real values to the repo.
```

- [ ] **Step 2: Commit**

```bash
git add docs/setup/runbook.md
git commit -m "docs: add go-live switches checklist for worker vars"
```

```
