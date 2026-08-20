# Email Preferences and Unsubscribe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers suppress optional abandoned-cart and wishlist emails through a signed one-click link or their account, without suppressing transactional order notifications.

**Architecture:** Add a service-role-only email preference table keyed by normalized email. A server-only HMAC service creates and verifies stateless unsubscribe tokens; the two engagement crons consult preferences before sending, while transactional order notifications remain untouched. Account settings use the existing authenticated customer/server-action pattern.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase service-role client, Node `crypto`, Nodemailer-compatible `MailTransport`, React 19, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-20-email-preferences-design.md`

## Global Constraints

- Engagement opt-out applies only to abandoned-cart and wishlist emails.
- Payment, cancellation, change-request, fulfillment, and other order notifications remain enabled.
- Preference keys are normalized lowercase/trimmed email addresses.
- Missing preference rows mean engagement email is enabled.
- Preference reads fail closed for engagement sends.
- HMAC signing uses server-only `EMAIL_PREFERENCES_SECRET`; never log email addresses, tokens, or secrets.
- All Supabase preference reads/writes use the service-role client; no public RLS policies are added.
- Existing local/demo behavior must continue when Supabase and Gmail are not configured.
- Follow the existing fake-client and dependency-injection patterns; tests never call live Supabase or Gmail.
- Preserve the existing uncommitted JSON-LD changes while creating the isolated implementation workspace.

---

### Task 1: Preference schema and pure/service boundary

**Files:**
- Create: `supabase/migrations/015_email_preferences.sql`
- Create: `features/email-preferences/preferences-service.ts`
- Create: `tests/domain/email-preferences.test.ts`
- Modify: `lib/server-env.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces `normalizeEmail(value: unknown): string | null`.
- Produces `createPreferenceToken(email: string, secret: string): string`.
- Produces `verifyPreferenceToken(email: string, token: string, secret: string): string | null`.
- Produces `EngagementPreference = { status: 'enabled' | 'disabled' | 'error' }`.
- Produces `getEngagementPreference(client, email): Promise<EngagementPreference>`.
- Produces `setEngagementPreference(client, email, enabled): Promise<'saved' | 'failure'>`.
- Produces `buildUnsubscribeUrl(origin, email, secret, locale?): string`.

- [ ] **Step 1: Write failing service tests.**

Add tests covering the exact desired behavior:

```ts
it('normalizes valid email addresses and rejects malformed values', () => {
  expect(normalizeEmail('  Buyer@Example.COM ')).toBe('buyer@example.com');
  expect(normalizeEmail('not-an-email')).toBeNull();
  expect(normalizeEmail('')).toBeNull();
});

it('round-trips an HMAC token and rejects tampered data or secrets', () => {
  const token = createPreferenceToken('buyer@example.com', 'secret');
  expect(verifyPreferenceToken('buyer@example.com', token, 'secret')).toBe('buyer@example.com');
  expect(verifyPreferenceToken('other@example.com', token, 'secret')).toBeNull();
  expect(verifyPreferenceToken('buyer@example.com', `${token}x`, 'secret')).toBeNull();
});

it('builds a URL with encoded email and token', () => {
  const url = buildUnsubscribeUrl('https://rosette.example/', 'Buyer@Example.com', 'secret');
  expect(url).toMatch(/^https:\/\/rosette\.example\/api\/email-preferences\/unsubscribe\?/);
  expect(url).toContain('email=buyer%40example.com');
  expect(url).toContain('token=');
});
```

Use a fake client whose `from('email_preferences')` exposes `select`, `maybeSingle`, and `upsert`. Add cases for a missing row (`enabled`), an explicit `engagement_enabled: false` row (`disabled`), an enabled row, a select error (`error`), a successful idempotent upsert, and an upsert error (`failure`). Assert the normalized email is the value sent to Supabase.

- [ ] **Step 2: Run the focused test to verify RED.**

Run:

```bash
npm test -- --run tests/domain/email-preferences.test.ts
```

Expected: failure because the new module and migration-backed service functions do not exist.

- [ ] **Step 3: Add the migration and minimal service implementation.**

Create the idempotent SQL:

```sql
create table if not exists public.email_preferences (
  email text primary key,
  engagement_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_preferences enable row level security;

alter table public.carts
  add column if not exists engagement_suppressed_at timestamptz;
```

Do not add public policies. In TypeScript, normalize before every database call. Use `createHmac('sha256', secret).update(normalizedEmail).digest('base64url')`; verify with `timingSafeEqual` only after comparing buffer lengths. Return `null` for invalid email/token input. `getEngagementPreference` must distinguish a missing row from a database error. `setEngagementPreference` must use `upsert({ email, engagement_enabled: enabled, updated_at: new Date().toISOString() }, { onConflict: 'email' })`.

`buildUnsubscribeUrl` must normalize the email, sign it, and return a URL
that includes the optional validated locale for localized confirmation copy:

```ts
`${origin.replace(/\/$/, '')}/api/email-preferences/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}${locale ? `&locale=${locale}` : ''}`
```

Throw only when called with an invalid email or empty secret; cron callers will catch preference/database failures separately.

Add `EMAIL_PREFERENCES_SECRET` to the `serverKeys` tuple and add an empty value plus a server-only comment to `.env.example`.

- [ ] **Step 4: Run the focused tests and typecheck.**

Run:

```bash
npm test -- --run tests/domain/email-preferences.test.ts
npm run lint
```

Expected: all preference tests pass and TypeScript is clean.

- [ ] **Step 5: Review the schema boundary.**

Confirm the migration is numbered after `014`, is safe to rerun, has no anon/authenticated policies, and does not change `notification_deliveries` or transactional order behavior.

---

### Task 2: Signed unsubscribe endpoint and engagement email footer/header support

**Files:**
- Create: `app/api/email-preferences/unsubscribe/route.ts`
- Create: `features/email-preferences/engagement-footer.ts`
- Create: `tests/routes/email-preferences.test.ts`
- Modify: `features/notifications/gmail-mailer.ts`
- Modify: `features/cart/abandoned-email.ts`
- Modify: `features/wishlist/email.ts`
- Modify: `tests/domain/abandoned-email.test.ts`
- Modify: `tests/domain/wishlist-cron.test.ts`

**Interfaces:**
- Produces `renderEngagementFooter(locale, unsubscribeUrl): { text: string; html: string }`.
- `MailTransport.sendMail` accepts optional `headers?: Record<string, string>`.
- `renderAbandonedCartEmail` accepts optional `unsubscribeUrl?: string`.
- `renderWishlistEmail` accepts optional `unsubscribeUrl?: string`.
- The route accepts `GET` query parameters and `POST` form/query parameters with `email` and `token`.

- [ ] **Step 1: Write failing footer, transport, and route tests.**

Add tests that assert:

```ts
it('renders localized unsubscribe copy and an escaped link', () => {
  const footer = renderEngagementFooter('en', 'https://x.example/unsubscribe?token=a&b=c');
  expect(footer.text).toContain('unsubscribe');
  expect(footer.html).toContain('https://x.example/unsubscribe?token=a&amp;b=c');
});

it('adds an unsubscribe footer only to engagement templates', () => {
  expect(renderAbandonedCartEmail({ locale: 'en', items: [], restoreUrl: 'https://x/cart', unsubscribeUrl: 'https://x/unsub' }).html).toContain('https://x/unsub');
  expect(renderWishlistEmail({ locale: 'en', type: 'wishlist_back_in_stock', productName: 'Rose', productUrl: 'https://x/product', unsubscribeUrl: 'https://x/unsub' }).text).toContain('https://x/unsub');
});
```

For the route, mock `getAdminSupabase`, `getRequiredServerEnv`, and the preference service or inject equivalent fakes. Cover valid GET and POST requests setting `engagement_enabled: false`, missing fields (`400`), invalid signatures (`400`), a validated `locale` used only for confirmation copy, and repeated valid requests remaining successful. Assert invalid requests do not disclose whether a row exists. Add a test that transactional `renderOrderEmail` remains unchanged and does not include an engagement footer.

- [ ] **Step 2: Run focused tests to verify RED.**

Run:

```bash
npm test -- --run tests/routes/email-preferences.test.ts tests/domain/abandoned-email.test.ts tests/domain/wishlist-cron.test.ts
```

Expected: failures because the footer, headers, route, and new inputs do not exist.

- [ ] **Step 3: Implement the footer, transport extension, and route.**

`renderEngagementFooter` should escape the URL using the existing `escapeHtml` helper and provide EN/AR/FR text with a short “manage email preferences/unsubscribe” link. Keep the function pure.

Extend `MailTransport` only as follows:

```ts
export type MailTransport = {
  sendMail: (message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    headers?: Record<string, string>;
  }) => Promise<unknown>;
};
```

Have both engagement senders pass headers when `unsubscribeUrl` exists:

```ts
headers: {
  'List-Unsubscribe': `<${unsubscribeUrl}>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
}
```

Append the footer to both text and HTML output. Keep the input optional so existing unit tests and direct renderer use remain valid; cron paths will always pass it.

The route should verify the query/form values with `verifyPreferenceToken`, call `setEngagementPreference(..., false)`, and return a generic localized HTML confirmation or JSON success for POST. Use `getRequiredServerEnv('EMAIL_PREFERENCES_SECRET')`; catch provider failures and return a generic `503` without logging sensitive values.

- [ ] **Step 4: Run focused tests and typecheck.**

Run:

```bash
npm test -- --run tests/routes/email-preferences.test.ts tests/domain/abandoned-email.test.ts tests/domain/wishlist-cron.test.ts tests/domain/email-templates.test.ts
npm run lint
```

Expected: all focused tests pass; transactional email tests remain green.

---

### Task 3: Abandoned-cart preference enforcement

**Files:**
- Modify: `features/cart/abandoned-cron.ts`
- Modify: `tests/domain/abandoned-cron.test.ts`
- Modify: `app/api/cron/abandoned-carts/route.ts` only if dependency wiring is required

**Interfaces:**
- `runAbandonedCartCron` receives the existing service-role client and optional
  dependencies `{ getPreference?: (email: string) => Promise<EngagementPreference>; secret?: string }` for deterministic tests.
- Summary becomes `{ checked: number; sent: number; failed: number; suppressed: number }`.

- [ ] **Step 1: Extend the fake client and write failing tests.**

Update the fake to support selecting carts with `engagement_suppressed_at` null and preference-table reads. Add tests:

```ts
it('suppresses an opted-out cart and marks it handled', async () => {
  const { client, calls } = fakeClient([row()], { preference: 'disabled' });
  const send = vi.fn();
  const summary = await runAbandonedCartCron(client, { origin: 'https://x', send, now, secret: 'secret' });
  expect(summary).toEqual({ checked: 1, sent: 0, failed: 0, suppressed: 1 });
  expect(send).not.toHaveBeenCalled();
  expect(calls).toContainEqual(expect.objectContaining({ table: 'carts', op: 'update', payload: { engagement_suppressed_at: now.toISOString() } }));
});

it('fails closed and leaves an errored preference eligible for retry', async () => {
  const { client, calls } = fakeClient([row()], { preference: 'error' });
  const summary = await runAbandonedCartCron(client, { origin: 'https://x', send: vi.fn(), now, secret: 'secret' });
  expect(summary).toEqual({ checked: 1, sent: 0, failed: 1, suppressed: 0 });
  expect(calls.filter((call) => call.payload && 'last_emailed_at' in call.payload)).toEqual([]);
});

it('passes a signed unsubscribe URL to enabled sends', async () => {
  const send = vi.fn(async () => {});
  const { client } = fakeClient([row()], { preference: 'enabled' });
  await runAbandonedCartCron(client, { origin: 'https://x', send, now, secret: 'secret' });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ unsubscribeUrl: expect.stringContaining('/api/email-preferences/unsubscribe') }));
});
```

Update existing summary expectations to include `suppressed: 0`.

- [ ] **Step 2: Run the focused cron test to verify RED.**

Run:

```bash
npm test -- --run tests/domain/abandoned-cron.test.ts
```

Expected: failures for the new summary field, preference lookup, suppression update, and unsubscribe URL.

- [ ] **Step 3: Implement preference gating.**

Add `engagement_suppressed_at` to the cart select/filter chain. Resolve the preference after the empty-lines guard and before sending. For `disabled`, update only `{ engagement_suppressed_at: now.toISOString() }`; for `error`, increment `failed` and continue without changing snapshot/email timestamps; for `enabled`, build the URL using `getRequiredServerEnv('EMAIL_PREFERENCES_SECRET')` in the route wiring or an injected secret/dependency and pass it into `sendAbandonedCartEmail`.

Keep `last_emailed_at` updates strictly after a successful send. Ensure a missing preference row is treated as enabled and a failure in one cart does not abort the batch.

- [ ] **Step 4: Run focused tests and typecheck.**

Run:

```bash
npm test -- --run tests/domain/abandoned-cron.test.ts tests/domain/abandoned-email.test.ts
npm run lint
```

Expected: all cart tests pass and the cron route still compiles.

---

### Task 4: Wishlist preference enforcement

**Files:**
- Modify: `features/wishlist/wishlist-cron.ts`
- Modify: `tests/domain/wishlist-cron.test.ts`
- Modify: `app/api/cron/wishlist/route.ts` only if dependency wiring is required

**Interfaces:**
- `runWishlistCron` retains the existing production call shape and accepts optional dependencies `{ getPreference?: (email: string) => Promise<EngagementPreference>; secret?: string }` alongside `{ origin, send? }`.
- Summary becomes `{ checked: number; sent: number; failed: number; suppressed: number }`.
- Wishlist sender input gains optional `unsubscribeUrl?: string`.

- [ ] **Step 1: Write failing suppression and failure-order tests.**

Add tests for an explicit disabled preference, an errored preference lookup, and an enabled send carrying a signed URL. The disabled case must update the price/stock snapshot and increment `suppressed`; the error case must not update the old snapshot and must increment `failed`; existing summary expectations gain `suppressed: 0`.

Example assertions:

```ts
it('suppresses a changed wishlist item but records the new snapshot', async () => {
  const { client, updates } = makeClient([row({ products: { ...row().products, price_minor: 8000 } })], { preference: 'disabled' });
  const summary = await runWishlistCron(client, { origin: 'https://example.com', send: vi.fn() });
  expect(summary).toEqual({ checked: 1, sent: 0, failed: 0, suppressed: 1 });
  expect(updates[0]!.payload).toEqual({ last_price_minor: 8000, last_available_stock: 3 });
});

it('does not consume a changed event when preference lookup fails', async () => {
  const { client, updates } = makeClient([row({ products: { ...row().products, price_minor: 8000 } })], { preference: 'error' });
  const summary = await runWishlistCron(client, { origin: 'https://example.com', send: vi.fn() });
  expect(summary).toEqual({ checked: 1, sent: 0, failed: 1, suppressed: 0 });
  expect(updates).toEqual([]);
});
```

- [ ] **Step 2: Run the focused test to verify RED.**

Run:

```bash
npm test -- --run tests/domain/wishlist-cron.test.ts
```

Expected: failures for the new summary, suppression, preference error, and URL behavior.

- [ ] **Step 3: Implement preference gating before snapshot consumption.**

For unchanged watches, preserve the existing snapshot update. For changed watches, resolve the email preference before updating the snapshot. On `error`, count `failed` and leave the old snapshot untouched. On `disabled`, update the snapshot and count `suppressed` without calling the sender. On `enabled`, build the signed URL, pass it to the sender, and update the snapshot after the send attempt using the existing failure semantics. Do not change product watch calculations or profile-email handling.

- [ ] **Step 4: Run focused tests and typecheck.**

Run:

```bash
npm test -- --run tests/domain/wishlist-cron.test.ts
npm run lint
```

Expected: all wishlist tests pass and both cron routes compile.

---

### Task 5: Account email preference control and localization

**Files:**
- Create: `components/account/EmailPreferences.tsx`
- Create: `tests/components/EmailPreferences.test.tsx`
- Modify: `features/account/actions.ts`
- Modify: `app/[locale]/[city]/account/(dashboard)/page.tsx`
- Modify: `features/i18n/dictionaries.ts`
- Modify: `tests/domain/i18n-dictionary.test.ts` only if a specific assertion is useful

**Interfaces:**
- Server action `setEmailEngagementPreference(enabled: boolean): Promise<'saved' | 'unauthenticated' | 'failure'>`.
- Client component props `{ initialEnabled: boolean; loadFailed?: boolean }`.
- Account profile page reads the current customer's email preference and passes the
  enabled state plus `loadFailed: true` when the preference query errors.

- [ ] **Step 1: Write failing action and component tests.**

Add action tests using faked customer/auth and preference clients for saved, unauthenticated, and failure results. Add component tests using `renderWithProviders` that verify the label, initial checked state, saving state, and success/error messages after toggling. The component should use a native accessible checkbox or the existing field/control convention; do not add a new dependency.

- [ ] **Step 2: Run focused tests to verify RED.**

Run:

```bash
npm test -- --run tests/components/EmailPreferences.test.tsx tests/domain/account-profile.test.ts
```

Expected: module/action/component failures because the control and action do not exist.

- [ ] **Step 3: Implement the action, server read, component, and translations.**

In `setEmailEngagementPreference`, call `getCurrentCustomer`; return `unauthenticated` without writing if absent. Resolve the admin/service-role client, call `setEngagementPreference(client, customer.email, enabled)`, revalidate the localized account profile path on success, and map write errors to `failure`.

In the account page, call `getEngagementPreference(getAdminSupabase(), customer.email)`, pass `initialEnabled: status === 'enabled'`, and pass `loadFailed: status === 'error'`; the client component must render its control disabled with the generic failure state when `loadFailed` is true rather than accidentally showing an enabled toggle. Keep the existing profile form and sign-out form unchanged.

Add concise EN/AR/FR keys for:

```ts
emailPreferences: 'Email preferences',
engagementEmailDescription: 'Receive saved-item and unfinished-bag reminders.',
emailPreferencesSaved: 'Email preferences updated.',
couldNotSaveEmailPreferences: 'Could not update email preferences.',
unsubscribeSuccess: 'You have been unsubscribed from engagement email.',
unsubscribeInvalid: 'This unsubscribe link is invalid or expired.',
```

Use equivalent Arabic and French translations, and preserve the existing dictionary superset test.

- [ ] **Step 4: Run focused tests and typecheck.**

Run:

```bash
npm test -- --run tests/components/EmailPreferences.test.tsx tests/domain/account-profile.test.ts tests/domain/i18n-dictionary.test.ts
npm run lint
```

Expected: all account/i18n tests pass.

---

### Task 6: Documentation, route verification, full gate, and review

**Files:**
- Modify: `docs/setup/runbook.md`
- Modify: `docs/operations/payments-email-chat.md`
- Modify: `tests/security/no-secrets.test.ts` only if the new env name needs explicit coverage
- Add or update relevant route tests from Tasks 2–5

- [ ] **Step 1: Add operational documentation.**

Document `EMAIL_PREFERENCES_SECRET` as a required random server secret, the
`015_email_preferences.sql` migration, the email-wide engagement-only scope,
and the guest unsubscribe URL behavior. State explicitly that transactional
order/payment/delivery emails are not suppressed. Add the variable to the
runbook environment table and deployment secret checklist without adding a
real secret value.

- [ ] **Step 2: Run the complete test suite.**

Run:

```bash
npm test
```

Expected: all existing tests plus the new preference, route, cron, template,
and component tests pass with zero failures.

- [ ] **Step 3: Run static checks and build.**

Run:

```bash
npm run lint
npm run build
```

Expected: TypeScript exits 0 and Next.js compiles the unsubscribe endpoint and account dashboard without route or server/client boundary errors.

- [ ] **Step 4: Run repository hygiene checks.**

Run:

```bash
git diff --check
npm test -- --run tests/security/no-secrets.test.ts
```

Confirm no secret values, generated `next-env.d.ts` changes, or unrelated files are included. Preserve the previously uncommitted JSON-LD changes when reviewing the final diff.

- [ ] **Step 5: Review the implementation against the spec.**

Check each requirement explicitly:

- migration is idempotent and service-role-only;
- HMAC tokens are normalized, signed, and timing-safe verified;
- GET and POST unsubscribe paths are generic on invalid input;
- cart suppression marks only opted-out carts and leaves lookup failures retryable;
- wishlist lookup failures do not consume watch events;
- engagement templates carry visible links and one-click headers;
- transactional templates remain unchanged;
- account setting is email-wide and localized in EN/AR/FR;
- docs contain no credentials.

Only after all checks pass should the feature branch be offered for integration. Do not push or commit without explicit user authorization.
