# Paid Commerce Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local-only storefront boundary with a secure, testable Supabase-backed commerce MVP using Paymob payments, Gmail SMTP notifications, a guarded Groq chatbot, WhatsApp handoff, and basic admin operations.

**Architecture:** Keep the current feature modules and repository interfaces. Add Supabase repositories and server-only service adapters behind those interfaces; preserve local mock repositories for tests and fallback. All payment, email, AI, and admin mutations run through server routes/actions, while the browser receives only safe results.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase PostgreSQL/Auth/Storage, Paymob Intention API and HMAC callbacks, Nodemailer Gmail SMTP, Groq SDK, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-17-paid-commerce-integrations-design.md`

## Global Constraints

- Never commit or request provider secrets in chat; use `.env.local` and deployment environment settings.
- Keep the existing English/Arabic dictionary and RTL behavior.
- Keep local mock repositories as the default when provider environment variables are absent.
- Supabase service-role access is server-only; browser code may use only the anon key through RLS-safe clients.
- Paymob callbacks must verify HMAC before changing payment or order state.
- Payment/order callbacks must be idempotent.
- Groq may answer only approved flower-store topics and may not mutate business data.
- Gmail failures must not change payment or fulfillment state.
- Tests must not call live Supabase, Paymob, Gmail, Groq, or WhatsApp services.
- Do not add a paid hosting requirement or commit real customer data.

---

### Task 1: Add safe provider configuration and dependencies

**Files:**
- Create: `.env.example`
- Create: `lib/server-env.ts`
- Modify: `.gitignore`
- Modify: `package.json`
- Test: `tests/lib/server-env.test.ts`

**Interfaces:**
- Produces `getOptionalServerEnv()` and `getRequiredServerEnv()` for server-only modules.
- Produces environment names: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMOB_API_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_HMAC_SECRET`, `PAYMOB_BASE_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_FROM`, `GROQ_API_KEY`, `GROQ_MODEL`, `WHATSAPP_BUSINESS_NUMBER`.

- [ ] **Step 1: Write the failing environment test**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';

describe('server environment', () => {
  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('returns undefined for an optional provider that is not configured', () => {
    expect(getOptionalServerEnv('GROQ_API_KEY')).toBeUndefined();
  });

  it('throws a named error for a required missing secret', () => {
    expect(() => getRequiredServerEnv('SUPABASE_SERVICE_ROLE_KEY')).toThrow(
      'Missing server environment variable: SUPABASE_SERVICE_ROLE_KEY',
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/lib/server-env.test.ts`

Expected: FAIL because `lib/server-env.ts` does not exist.

- [ ] **Step 3: Install only required packages**

Run: `npm install @supabase/supabase-js nodemailer groq-sdk && npm install -D @types/nodemailer`

Paymob uses `fetch` and Web Crypto/Node crypto, so no Paymob SDK is added.

- [ ] **Step 4: Implement server environment access**

```ts
const serverKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PAYMOB_API_KEY',
  'PAYMOB_PUBLIC_KEY',
  'PAYMOB_INTEGRATION_ID',
  'PAYMOB_HMAC_SECRET',
  'PAYMOB_BASE_URL',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
  'GMAIL_FROM',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'WHATSAPP_BUSINESS_NUMBER',
] as const;

type ServerKey = (typeof serverKeys)[number];

export function getOptionalServerEnv(key: ServerKey) {
  return process.env[key] || undefined;
}

export function getRequiredServerEnv(key: ServerKey) {
  const value = getOptionalServerEnv(key);
  if (!value) throw new Error(`Missing server environment variable: ${key}`);
  return value;
}
```

- [ ] **Step 5: Add a safe `.env.example` and allowlist it**

`.env.example` contains names only, never values. Add `!.env.example` after `.env*` in `.gitignore`.

- [ ] **Step 6: Run the focused test and typecheck**

Run: `npm test -- tests/lib/server-env.test.ts && npm run lint`

Expected: PASS.

---

### Task 2: Create the Supabase schema and domain migration

**Files:**
- Create: `supabase/migrations/001_commerce.sql`
- Create: `supabase/seed.sql`
- Create: `features/commerce/db-types.ts`
- Test: `tests/domain/order-state.test.ts`

**Interfaces:**
- Defines SQL tables from the spec: profiles, products, product_variants, categories, cities, delivery_rules, inventory, inventory_reservations, addresses, orders, order_items, payments, order_events, notification_deliveries, admin_audit_logs.
- Defines `PaymentStatus`, `FulfillmentStatus`, `OrderState`, and typed transition functions used by later tasks.

- [ ] **Step 1: Write failing order transition tests**

```ts
import { describe, expect, it } from 'vitest';
import { canTransitionPayment, canTransitionFulfillment } from '@/features/commerce/order-state';

describe('order state transitions', () => {
  it('allows pending payment to become paid', () => {
    expect(canTransitionPayment('payment_started', 'paid')).toBe(true);
  });

  it('rejects a browser-style paid-to-pending transition', () => {
    expect(canTransitionPayment('paid', 'pending')).toBe(false);
  });

  it('allows only valid fulfillment progression', () => {
    expect(canTransitionFulfillment('confirmed', 'preparing')).toBe(true);
    expect(canTransitionFulfillment('delivered', 'preparing')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/domain/order-state.test.ts`

Expected: FAIL because the transition module does not exist.

- [ ] **Step 3: Implement typed state transitions**

Create `features/commerce/order-state.ts` with explicit sets:

```ts
export type PaymentStatus = 'pending' | 'payment_started' | 'paid' | 'payment_failed' | 'cancelled' | 'refunded';
export type FulfillmentStatus = 'confirmed' | 'preparing' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered' | 'cancelled';

const paymentTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ['payment_started', 'cancelled'],
  payment_started: ['paid', 'payment_failed', 'cancelled'],
  paid: ['refunded'],
  payment_failed: ['cancelled', 'payment_started'],
  cancelled: [],
  refunded: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus) {
  return paymentTransitions[from].includes(to);
}
```

Apply the same explicit pattern to fulfillment states.

- [ ] **Step 4: Write the SQL migration**

Use UUID primary keys, `timestamptz`, integer money in minor EGP units, foreign keys, unique provider references, check constraints, indexes for product slug/order display number/payment references, and RLS enablement. Store immutable bilingual snapshots in `order_items`.

The migration must include a unique idempotency key on payment events and a unique `(order_id, variant_id)` reservation identity where appropriate.

- [ ] **Step 5: Add deterministic seed data**

Create seed rows matching the current local catalog/cities, including bilingual fields and inventory quantities. Do not include customer records, secrets, or real personal data.

- [ ] **Step 6: Run domain tests and typecheck**

Run: `npm test -- tests/domain/order-state.test.ts && npm run lint`

Expected: PASS.

---

### Task 3: Add Supabase clients and provider selection

**Files:**
- Create: `lib/supabase/browser.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`
- Create: `features/catalog/provider.ts`
- Test: `tests/lib/provider-selection.test.ts`

**Interfaces:**

```ts
export function getCatalogRepository(): CatalogRepository
```

It returns the Supabase implementation only when the required public/server configuration exists; otherwise it returns the current local repository. The order provider is added together with the persistent order repository in Task 5 so its interface is defined before use.

- [ ] **Step 1: Write the failing provider-selection test**

```ts
import { describe, expect, it } from 'vitest';
import { selectDataSource } from '@/features/commerce/provider-selection';

describe('data source selection', () => {
  it('uses local mode without Supabase configuration', () => {
    expect(selectDataSource({ url: undefined, key: undefined })).toBe('local');
  });

  it('uses Supabase only when both public values exist', () => {
    expect(selectDataSource({ url: 'https://example.supabase.co', key: 'anon' })).toBe('supabase');
  });
});
```

- [ ] **Step 2: Implement Supabase client boundaries**

Use `@supabase/supabase-js`. The browser client uses public URL/anon key. The server client reads request cookies if auth is enabled. The admin client requires `SUPABASE_SERVICE_ROLE_KEY` and is imported only by server routes/actions.

- [ ] **Step 3: Implement provider selection and test it**

Run: `npm test -- tests/lib/provider-selection.test.ts && npm run lint`

Expected: PASS.

---

### Task 4: Replace the catalog read path with Supabase while preserving fallback

**Files:**
- Create: `features/catalog/supabase-repository.ts`
- Create: `features/catalog/row-mappers.ts`
- Modify: `app/shop/page.tsx`
- Modify: `app/shop/[slug]/page.tsx`
- Modify: `features/catalog/ProductCard.tsx`
- Test: `tests/domain/catalog-repository.test.ts`

**Interfaces:**
- `supabaseCatalogRepository` implements the existing `CatalogRepository`.
- It maps rows to the existing `Product` shape, including `nameAr`, `descriptionAr`, variants, add-ons, and inventory.

- [ ] **Step 1: Write failing repository mapping tests**

Test a Supabase-shaped row with bilingual fields and nested variants and assert the exact `Product` output. Test an inactive product is not returned and a missing slug returns `null`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/domain/catalog-repository.test.ts`

Expected: FAIL because the mapper/repository does not exist.

- [ ] **Step 3: Implement row mapping and repository queries**

Keep query filtering server-side where practical. Use stable slug lookups, active product filtering, and a delivery-rule query. Do not expose service-role credentials to the client.

- [ ] **Step 4: Switch shop/product pages through `getCatalogRepository()`**

Keep local data as the no-environment fallback so existing tests and development still work.

- [ ] **Step 5: Run focused tests, full tests, and build**

Run: `npm test -- tests/domain/catalog-repository.test.ts && npm test && npm run build`

Expected: PASS.

---

### Task 5: Add persistent orders, inventory reservations, and guest checkout

**Files:**
- Create: `features/inventory/types.ts`
- Create: `features/inventory/service.ts`
- Create: `features/order/supabase-repository.ts`
- Create: `features/order/provider.ts`
- Create: `app/api/orders/route.ts`
- Create: `app/api/orders/[id]/route.ts`
- Modify: `features/order/types.ts`
- Modify: `features/checkout/types.ts`
- Modify: `features/checkout/CheckoutForm.tsx`
- Modify: `app/orders/[id]/page.tsx`
- Test: `tests/domain/inventory-reservation.test.ts`
- Test: `tests/routes/orders.test.ts`

**Interfaces:**

```ts
export type ReservationResult =
  | { ok: true; reservationId: string; expiresAt: string }
  | { ok: false; reason: 'not_found' | 'insufficient_stock' | 'expired' };

export interface OrderRepository {
  createPending(input: CreatePendingOrderInput): Promise<Result<PendingOrder, OrderCreateError>>;
  getPublicOrder(id: string, verification: OrderVerification): Promise<Order | null>;
}
```

`features/order/provider.ts` exports `getOrderRepository(): OrderRepository` and returns the Supabase implementation when configured, otherwise the local-compatible implementation.

- [ ] **Step 1: Write failing reservation and route tests**

Cover successful reservation, insufficient stock, release after failed payment, server-side total recalculation, and rejection of a client-submitted total.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- tests/domain/inventory-reservation.test.ts tests/routes/orders.test.ts`

Expected: FAIL because persistent order modules do not exist.

- [ ] **Step 3: Implement the transaction boundary**

Use a Supabase SQL function/RPC for reserve-and-create-pending-order so inventory updates and order snapshots are atomic. The route accepts checkout fields and cart line IDs/options, reloads authoritative product data, and calculates EGP minor-unit totals on the server.

- [ ] **Step 4: Update checkout to call the order route**

Remove direct `createLocalOrder` usage from the production checkout path. Keep a local-mode branch when Supabase is not configured. The client receives a pending order ID and Paymob checkout URL/token, not a paid status.

- [ ] **Step 5: Add public order lookup protection**

Require order ID plus matching phone/email verification. Never return full customer data to an unauthenticated lookup.

- [ ] **Step 6: Run focused/full tests and build**

Run: `npm test -- tests/domain/inventory-reservation.test.ts tests/routes/orders.test.ts && npm test && npm run lint && npm run build`

Expected: PASS.

---

### Task 6: Implement Paymob payment creation and verified callbacks

**Files:**
- Create: `features/payment/types.ts`
- Create: `features/payment/paymob-client.ts`
- Create: `features/payment/paymob-hmac.ts`
- Create: `features/payment/payment-service.ts`
- Create: `app/api/payments/paymob/intention/route.ts`
- Create: `app/api/webhooks/paymob/route.ts`
- Test: `tests/domain/paymob-hmac.test.ts`
- Test: `tests/routes/paymob-webhook.test.ts`

**Interfaces:**

```ts
export interface PaymentGateway {
  createCheckout(input: CreatePaymentInput): Promise<{ providerReference: string; checkoutUrl: string }>;
}

export function verifyPaymobCallback(payload: PaymobCallback, secret: string): boolean;
export function transitionPaymentFromCallback(input: PaymentCallbackInput): Promise<PaymentTransitionResult>;
```

- [ ] **Step 1: Write failing HMAC tests**

Use fixed Paymob callback fixtures from the provider documentation, test a valid signature, a changed amount, a missing signature, and a wrong secret.

- [ ] **Step 2: Run HMAC tests and verify failure**

Run: `npm test -- tests/domain/paymob-hmac.test.ts`

Expected: FAIL because the verifier does not exist.

- [ ] **Step 3: Implement HMAC verification exactly from the current Paymob Egypt callback field order**

Use Node `crypto` HMAC-SHA512, constant-time comparison, and reject missing/invalid fields. Keep the field-order adapter isolated so provider changes do not leak into order logic.

- [ ] **Step 4: Implement the Paymob client with `fetch`**

Use the current Paymob Intention API documented for Egypt. Send integer minor-unit EGP amount, currency, internal order reference, customer contact data, and configured integration/public values. Never accept amount from the browser without server recalculation.

- [ ] **Step 5: Implement idempotent webhook processing**

Verify HMAC, validate order reference/amount/currency, insert the provider event using a unique idempotency key, and transition payment/order state in one database operation. Repeated accepted events return a successful response without duplicate order events.

- [ ] **Step 6: Add failure/refund behavior and route tests**

Test success, failure, expired, duplicate, invalid signature, unknown order, and amount mismatch callbacks. Failed/expired states release inventory; paid state creates an email delivery record.

- [ ] **Step 7: Run payment tests and typecheck**

Run: `npm test -- tests/domain/paymob-hmac.test.ts tests/routes/paymob-webhook.test.ts && npm run lint`

Expected: PASS without external network calls.

---

### Task 7: Add Gmail SMTP transactional notifications

**Files:**
- Create: `features/notifications/email-types.ts`
- Create: `features/notifications/gmail-mailer.ts`
- Create: `features/notifications/email-templates.ts`
- Create: `features/notifications/notification-service.ts`
- Create: `app/api/notifications/email/test/route.ts`
- Test: `tests/domain/email-templates.test.ts`
- Test: `tests/domain/notification-service.test.ts`

**Interfaces:**

```ts
export type EmailLocale = 'en' | 'ar';
export type NotificationType = 'order_received' | 'payment_confirmed' | 'payment_failed' | 'preparing' | 'out_for_delivery' | 'delivered';
export interface NotificationService {
  sendOrderNotification(input: OrderNotificationInput): Promise<{ accepted: boolean; deliveryId?: string }>;
}
```

- [ ] **Step 1: Write failing template/service tests**

Assert Arabic templates include `dir="rtl"`, English templates include `dir="ltr"`, order number and total are escaped, and a transporter failure returns a retryable result.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- tests/domain/email-templates.test.ts tests/domain/notification-service.test.ts`

Expected: FAIL because the notification modules do not exist.

- [ ] **Step 3: Implement safe HTML templates**

Use escaped values, localized labels, plain-text fallback, and the existing order route URL. Do not include card information or internal secrets.

- [ ] **Step 4: Implement Nodemailer transport lazily**

Create the SMTP transport only when the notification service is invoked and Gmail env values exist. Tests inject a fake transporter. Missing Gmail configuration creates a disabled/fallback result rather than crashing checkout.

- [ ] **Step 5: Add protected development test route**

The route must be development-only or admin-only and must never echo SMTP configuration.

- [ ] **Step 6: Run tests and build**

Run: `npm test -- tests/domain/email-templates.test.ts tests/domain/notification-service.test.ts && npm run lint && npm run build`

Expected: PASS.

---

### Task 8: Implement the guarded Groq chatbot

**Files:**
- Create: `features/chat/types.ts`
- Create: `features/chat/topic-guard.ts`
- Create: `features/chat/response-schema.ts`
- Create: `features/chat/context.ts`
- Create: `features/chat/groq-assistant.ts`
- Create: `app/api/chat/route.ts`
- Test: `tests/domain/chat-topic-guard.test.ts`
- Test: `tests/domain/chat-response.test.ts`

**Interfaces:**

```ts
export type ChatAction = 'none' | 'show_products' | 'lookup_order' | 'whatsapp';
export type ChatResponse = { answer: string; language: 'ar' | 'en'; action: ChatAction; productSlugs?: string[]; requiresHuman?: boolean };
export function classifyChatTopic(message: string): 'store' | 'unsupported' | 'order_lookup' | 'support';
export function parseChatResponse(value: unknown): ChatResponse;
```

- [ ] **Step 1: Write failing guard and parser tests**

Test Arabic and English store questions as allowed, unrelated questions as unsupported, prompt-injection attempts as unsupported, and invalid Groq JSON as rejected.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- tests/domain/chat-topic-guard.test.ts tests/domain/chat-response.test.ts`

Expected: FAIL because chat modules do not exist.

- [ ] **Step 3: Implement deterministic topic filtering**

Use normalized Arabic/English keyword and intent rules for products, flowers, prices, delivery, orders, payment support, and contact. Reject unsupported topics before the model call.

- [ ] **Step 4: Implement response validation**

Validate action enum, language, answer length, product slugs against the current catalog, and human-handoff flag. Invalid model output becomes a localized fallback.

- [ ] **Step 5: Implement server-only Groq adapter**

Use `groq-sdk`, configured model from `GROQ_MODEL`, temperature low enough for consistent support answers, and structured output/JSON mode where supported. The system prompt explicitly says that catalog/delivery/order context is authoritative and unrelated requests must be refused.

- [ ] **Step 6: Add context tools**

Provide narrowly scoped functions for public product search, delivery rule lookup, and verified order lookup. Do not expose raw Supabase clients or arbitrary SQL to Groq.

- [ ] **Step 7: Add rate limiting and fallback**

Limit message length and per-session/IP calls with a small in-process guard for the first deployment. When the limit or provider fails, return FAQ fallback plus WhatsApp action.

- [ ] **Step 8: Run tests and build**

Run: `npm test -- tests/domain/chat-topic-guard.test.ts tests/domain/chat-response.test.ts && npm run lint && npm run build`

Expected: PASS without a live Groq key.

---

### Task 9: Add chat UI and WhatsApp human handoff

**Files:**
- Create: `features/chat/ChatWidget.tsx`
- Create: `features/support/whatsapp.ts`
- Create: `components/support/WhatsAppButton.tsx`
- Modify: `app/layout.tsx`
- Modify: `features/i18n/dictionaries.ts`
- Modify: `app/globals.css`
- Test: `tests/domain/whatsapp.test.ts`
- Test: `tests/components/ChatWidget.test.tsx`

**Interfaces:**

```ts
export function createWhatsAppHref(input: { number: string; locale: 'ar' | 'en'; orderId?: string }): string;
```

- [ ] **Step 1: Write failing WhatsApp URL and UI tests**

Assert phone normalization, URL encoding, Arabic/English message selection, order number inclusion, and fallback when no business number is configured.

- [ ] **Step 2: Implement the WhatsApp URL helper**

Generate only `https://wa.me/...` URLs and encode the message. Never include payment secrets or full address data.

- [ ] **Step 3: Implement the accessible chat widget**

Add open/close state, message list, loading/error state, locale-aware direction, keyboard operation, character limit, product-card action, order-lookup action, and WhatsApp fallback.

- [ ] **Step 4: Add localized strings and styles**

Use the existing dictionary and logical CSS properties. Keep the widget unobtrusive on mobile and ensure it does not cover checkout controls.

- [ ] **Step 5: Run component/domain tests and build**

Run: `npm test -- tests/domain/whatsapp.test.ts tests/components/ChatWidget.test.tsx && npm run lint && npm run build`

Expected: PASS.

---

### Task 10: Add Supabase Auth and protected admin foundation

**Files:**
- Create: `features/auth/server.ts`
- Create: `features/auth/types.ts`
- Create: `features/admin/authorization.ts`
- Create: `app/admin/layout.tsx`
- Create: `app/admin/page.tsx`
- Create: `app/admin/products/page.tsx`
- Create: `app/admin/inventory/page.tsx`
- Create: `app/admin/orders/page.tsx`
- Create: `app/admin/delivery/page.tsx`
- Create: `app/api/admin/orders/[id]/status/route.ts`
- Test: `tests/domain/admin-authorization.test.ts`
- Test: `tests/routes/admin-status.test.ts`

**Interfaces:**

```ts
export type AdminRole = 'admin' | 'operator';
export async function requireAdmin(request: Request, allowedRoles?: AdminRole[]): Promise<AdminIdentity>;
export function canUpdateOrderStatus(role: AdminRole, from: FulfillmentStatus, to: FulfillmentStatus): boolean;
```

- [ ] **Step 1: Write failing authorization/status tests**

Test unauthenticated rejection, operator allowed only fulfillment updates, admin allowed catalog/inventory updates, and invalid order transitions.

- [ ] **Step 2: Implement server-side role checks**

Read the authenticated Supabase user server-side, load role from a protected profile/role table, and reject unauthorized requests with 401/403. Never trust a client-provided role.

- [ ] **Step 3: Implement admin status route**

Validate transition, update order, append `order_events`, append `admin_audit_logs`, and create notification delivery records for customer-visible changes.

- [ ] **Step 4: Implement initial admin pages**

Use server-loaded lists and small client forms for products, inventory, orders, and delivery rules. Keep CRUD surfaces focused; do not build a full CMS.

- [ ] **Step 5: Run tests and build**

Run: `npm test -- tests/domain/admin-authorization.test.ts tests/routes/admin-status.test.ts && npm run lint && npm run build`

Expected: PASS.

---

### Task 11: Connect the paid checkout end-to-end and document operations

**Files:**
- Modify: `features/checkout/CheckoutForm.tsx`
- Modify: `features/checkout/types.ts`
- Modify: `features/order/OrderPageContent.tsx`
- Modify: `features/order/OrderTimeline.tsx`
- Modify: `features/i18n/dictionaries.ts`
- Modify: `README.md`
- Create: `docs/operations/payments-email-chat.md`
- Test: `tests/routes/purchase-flow.test.tsx`

**Interfaces:**
- Checkout uses `paymentMethod: 'paymob'` when configured and retains a local/mock mode without external env values.
- Order confirmation renders `pending`, `paid`, `payment_failed`, and `cancelled` states in English and Arabic.

- [ ] **Step 1: Extend the route-level purchase-flow test**

Cover checkout submission to pending order, redirect intent response, paid confirmation fixture, and failure fallback. Assert the UI never claims payment success from a browser-only redirect.

- [ ] **Step 2: Update checkout UI**

Replace the demo-card choice with Paymob when configured, retain a clearly labeled local mock option only when external configuration is absent, and show payment-pending guidance.

- [ ] **Step 3: Update order confirmation/timeline**

Read safe public order status and render retry/support actions. Add WhatsApp handoff with the order number.

- [ ] **Step 4: Add bilingual operation documentation**

Document Supabase setup/migrations, Paymob test credentials and callback URL configuration without asking users to put secrets in Git, Gmail app-password storage, Groq key setup, test-mode verification, and production checklist.

- [ ] **Step 5: Run full verification**

Run: `npm test && npm run lint && npm run build && npm audit --omit=dev`

Expected: all tests pass, typecheck/build pass, and no production dependency audit vulnerabilities.

---

### Task 12: Final security and fallback review

**Files:**
- Modify: `.gitignore` if needed
- Modify: `README.md` if needed
- Test: `tests/security/no-secrets.test.ts`

- [ ] **Step 1: Add a repository secret-scan test**

Scan tracked text files for known secret prefixes and private environment names/values, excluding `.env.example`. The test must fail if a real `gsk_`, `sk_`, Gmail app password pattern, or service-role key is committed.

- [ ] **Step 2: Run all verification commands**

Run:

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
git diff --check
git status --short
```

Expected: no test/type/build/audit failures, no whitespace errors, and no credentials in tracked changes.

- [ ] **Step 3: Review the provider fallback**

Verify the app still starts and supports local mock browsing/cart/checkout when Supabase, Paymob, Gmail, and Groq variables are absent. Confirm all missing-provider states are explicit to the user and do not expose stack traces.

- [ ] **Step 4: Record manual test checklist**

Document test-mode Paymob success/failure/duplicate callback, Arabic email direction, Groq unrelated-question refusal, customer/admin authorization, WhatsApp URL, and mobile checkout behavior.
