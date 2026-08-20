# Rosette Gift Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers purchase digital gift cards through Paymob, let admins issue and operate cards, and let one card be redeemed atomically against a normal flower order.

**Architecture:** Gift-card purchases use dedicated records and a Paymob `special_reference` (`giftcard:<purchase-id>`), so a card is created only after a verified callback. Spendable cards store only an HMAC lookup hash plus AES-GCM ciphertext for server-only delivery/resend; all balance changes use Supabase security-definer functions and an append-only transaction ledger. Checkout receives only a code and returns masked quote data; the server calculates the authoritative order total, reserves the card balance, creates the Paymob intention for the remainder, and converts or releases the hold from verified payment outcomes.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase/Postgres RPCs and service-role client, Paymob intentions/HMAC callbacks, Nodemailer/Gmail, Vitest, Testing Library, existing Tailwind/Radix UI components.

**Spec:** `docs/superpowers/specs/2026-08-20-gift-cards-design.md`

## Global Constraints

- Gift cards are digital only; there is one card per order, no stacking, no cash-out, no transfers, and no ordinary flower-cart purchase flow.
- Fixed denominations and custom amounts use integer EGP minor units; custom amounts are bounded by `50000`–`5000000` minor units (500–50,000 EGP), and fixed denominations are `50000`, `100000`, `250000`, and `500000` minor units.
- Cards expire 12 months after activation or admin issuance.
- Plaintext codes never enter ordinary database columns, orders, logs, audit metadata, API responses, or client components; only server-side delivery/resend code may decrypt them.
- Invalid gift-card input returns a generic error and never reveals whether a card exists.
- Gift-card tables have RLS enabled with no public policies; application reads and writes use the service-role client or security-definer functions.
- Paymob HMAC verification and provider-amount checks happen before any purchase/card mutation; duplicate callbacks and cancellation/refund events are idempotent.
- Email failure never invalidates paid value; it records retryable delivery state.
- Existing local/demo checkout remains functional without Supabase or Paymob.
- Transactional order notifications and the existing promo behavior remain intact.

---

## File map

### New files

- `supabase/migrations/016_gift_cards.sql` — gift-card tables, order columns, indexes, RLS, and atomic security-definer functions.
- `features/gift-cards/types.ts` — amount, card, purchase, hold, transaction, quote, and service result types.
- `features/gift-cards/validation.ts` — fixed/custom amount and purchase/admin input validation.
- `features/gift-cards/crypto.ts` — code generation, normalization, HMAC hashing, AES-GCM encryption/decryption, and masking.
- `features/gift-cards/repository.ts` — service-role database boundary for purchases, cards, delivery state, and transactions.
- `features/gift-cards/service.ts` — purchase activation, quote, hold/redeem/release/refund orchestration, and idempotency.
- `features/gift-cards/purchase-email.ts` — localized buyer/recipient email rendering and delivery adapter.
- `features/gift-cards/purchase-route.ts` — pure Paymob purchase-reference and callback URL builder.
- `features/gift-cards/admin-actions.ts` — authorization, issue/void/resend/list actions, and admin audit writes.
- `features/gift-cards/GiftCardPurchaseForm.tsx` — localized customer purchase form.
- `features/gift-cards/GiftCardCheckoutResult.tsx` — purchase-result state without exposing a code.
- `features/gift-cards/AdminGiftCardForm.tsx` — admin issuance form.
- `features/gift-cards/AdminGiftCardActions.tsx` — client controls for void/resend actions.
- `app/[locale]/[city]/gift-cards/page.tsx` — localized purchase page.
- `app/[locale]/[city]/gift-cards/result/page.tsx` — localized purchase result page.
- `app/api/gift-cards/purchases/route.ts` — purchase validation, pending-record creation, and Paymob intention creation.
- `app/api/admin/gift-cards/route.ts` — authenticated admin issue, void, resend, and list mutations.
- `app/admin/gift-cards/page.tsx` — admin card list and issuance UI.
- `tests/domain/gift-card-validation.test.ts` — amount and input validation.
- `tests/domain/gift-card-crypto.test.ts` — code lifecycle and secrecy tests.
- `tests/domain/gift-card-service.test.ts` — purchase activation, quote, and balance lifecycle.
- `tests/domain/gift-card-purchase-email.test.ts` — localized delivery rendering.
- `tests/routes/gift-card-purchases.test.ts` — purchase route and Paymob payload behavior.
- `tests/domain/gift-card-admin.test.ts` — admin authorization and audit behavior.
- `tests/routes/gift-card-admin.test.ts` — admin route authorization and result mapping.
- `tests/components/GiftCardPurchaseForm.test.tsx` — customer form rendering and validation.
- `tests/components/AdminGiftCardForm.test.tsx` — admin form behavior.

### Existing files to modify

- `.env.example`, `lib/server-env.ts` — register `GIFT_CARD_SECRET`.
- `features/payment/types.ts`, `features/payment/paymob-client.ts` — support an explicit `specialReference` while preserving existing order payloads.
- `app/api/webhooks/paymob/route.ts` — route verified `giftcard:` callbacks before ordinary orders.
- `features/checkout/types.ts`, `features/checkout/validation.ts`, `features/checkout/CheckoutForm.tsx` — accept/render gift-card code and masked quote result.
- `features/order/types.ts`, `features/order/order-insert.ts`, `features/order/supabase-repository.ts`, `features/order/provider.ts` — carry gift-card fields, calculate the authoritative discount, create/hold the card balance, and preserve local behavior.
- `app/api/orders/route.ts` — release holds when intention creation fails and finalize zero-total orders.
- `features/orders/cancel-actions.ts` — restore gift-card redemption during an approved cancellation exactly once.
- `features/i18n/dictionaries.ts` — add gift-card customer/admin copy in EN/AR/FR.
- `components/admin/AdminShell.tsx`, `components/admin/AppSidebar.tsx` — add the gift-card operations link/icon.
- `docs/setup/runbook.md`, `docs/operations/payments-email-chat.md` — document migration, secret, Paymob gift-card references, resend/failure behavior, and verification SQL.

---

### Task 1: Add the secure gift-card data model and pure domain primitives

**Files:**
- Create: `supabase/migrations/016_gift_cards.sql`
- Create: `features/gift-cards/types.ts`
- Create: `features/gift-cards/validation.ts`
- Create: `features/gift-cards/crypto.ts`
- Modify: `.env.example`
- Modify: `lib/server-env.ts`
- Test: `tests/domain/gift-card-validation.test.ts`
- Test: `tests/domain/gift-card-crypto.test.ts`

**Interfaces:**
- Produces `GiftCardAmount`, `GiftCardPurchaseInput`, `GiftCardQuote`, `normalizeGiftCardCode`, `generateGiftCardCode`, `hashGiftCardCode`, `encryptGiftCardCode`, `decryptGiftCardCode`, and `maskGiftCardCode` for all later tasks.
- The migration produces `gift_card_purchases`, `gift_cards`, `gift_card_holds`, `gift_card_transactions`, order gift-card columns, and RPCs named `reserve_gift_card`, `redeem_gift_card_hold`, `release_gift_card_hold`, and `refund_gift_card_redemption`.

- [ ] **Step 1: Write failing validation tests.** Cover fixed denominations, custom amounts at 500 EGP and 50,000 EGP, values outside bounds, fractional/NaN/negative amounts, malformed email fields, unsupported locale, overlong message, and normalized uppercase code format. Assert validation returns stable generic error codes rather than database-specific text.

```ts
expect(validateGiftCardAmount({ mode: 'fixed', amountMinor: 100000 })).toEqual({ ok: true, amountMinor: 100000 });
expect(validateGiftCardAmount({ mode: 'custom', amountMinor: 49999 })).toEqual({ ok: false, error: 'invalid_amount' });
expect(validateGiftCardAmount({ mode: 'custom', amountMinor: 5000001 })).toEqual({ ok: false, error: 'invalid_amount' });
```

- [ ] **Step 2: Run the focused tests and confirm RED.**

Run: `npm test -- --run tests/domain/gift-card-validation.test.ts`

Expected: FAIL because the gift-card validation module does not exist.

- [ ] **Step 3: Write failing crypto tests.** Assert generated codes contain no ambiguous characters, normalized codes hash deterministically, different codes hash differently, AES-GCM round trips with the configured secret, decryption fails for tampered ciphertext, and masking exposes only the final four characters. Assert no helper returns a code from a database-shaped object.

```ts
const code = generateGiftCardCode();
expect(decryptGiftCardCode(encryptGiftCardCode(code, 'secret'), 'secret')).toBe(code);
expect(maskGiftCardCode(code)).toBe(`•••• ${code.slice(-4)}`);
```

- [ ] **Step 4: Run crypto tests to confirm RED.**

Run: `npm test -- --run tests/domain/gift-card-crypto.test.ts`

Expected: FAIL because the crypto module does not exist.

- [ ] **Step 5: Implement pure types, validation, and crypto.** Use `node:crypto` `randomBytes`, `createHmac`, `createCipheriv`, `createDecipheriv`, and `timingSafeEqual`. Encode AES-GCM as a versioned string containing IV, auth tag, and ciphertext; read `GIFT_CARD_SECRET` only through `getRequiredServerEnv` in the server boundary, while pure helpers accept an explicit secret for deterministic tests. Generate codes in grouped uppercase form but normalize by removing separators and uppercasing before hashing.

- [ ] **Step 6: Add the migration.** Create the tables and checks from the spec, add indexes for purchase reference, card status/expiry, recipient email, and hold status, add `gift_card_minor`, `gift_card_id`, `gift_card_hold_id`, and `gift_card_code_last4` to `orders`, enable RLS with no public policies, and implement security-definer RPCs that lock the card row, reject expired/void/depleted cards, enforce one active hold per order/card, append exactly one idempotent ledger transaction, and update balance/status atomically. Add `delivery_status`, `delivery_attempts`, and `last_delivery_error` to `gift_cards` so admin-issued cards have the same retryable delivery state as purchased cards. `refund_gift_card_redemption` must use a unique idempotency key and never restore more than the original redeemed amount.

- [ ] **Step 7: Register the server secret and run the focused tests.**

Run: `npm test -- --run tests/domain/gift-card-validation.test.ts tests/domain/gift-card-crypto.test.ts && npm run lint`

Expected: all focused tests pass and TypeScript is clean.

- [ ] **Step 8: Commit the foundation.**

```bash
git add supabase/migrations/016_gift_cards.sql features/gift-cards/types.ts features/gift-cards/validation.ts features/gift-cards/crypto.ts tests/domain/gift-card-validation.test.ts tests/domain/gift-card-crypto.test.ts .env.example lib/server-env.ts
git commit -m "feat: add gift card ledger foundation"
```

---

### Task 2: Build the purchase Paymob flow and post-payment delivery

**Files:**
- Create: `features/gift-cards/repository.ts`
- Create: `features/gift-cards/service.ts`
- Create: `features/gift-cards/purchase-email.ts`
- Create: `features/gift-cards/GiftCardPurchaseForm.tsx`
- Create: `features/gift-cards/GiftCardCheckoutResult.tsx`
- Create: `app/[locale]/[city]/gift-cards/page.tsx`
- Create: `app/[locale]/[city]/gift-cards/result/page.tsx`
- Create: `app/api/gift-cards/purchases/route.ts`
- Modify: `features/payment/types.ts`
- Modify: `features/payment/paymob-client.ts`
- Modify: `app/api/webhooks/paymob/route.ts`
- Test: `tests/domain/gift-card-service.test.ts`
- Test: `tests/domain/gift-card-purchase-email.test.ts`
- Test: `tests/routes/gift-card-purchases.test.ts`

**Interfaces:**
- `createGiftCardPurchase(client, input, deps)` creates a pending purchase and returns `{ ok: true, value: { purchaseId, reference, checkoutUrl } }` without a plaintext code.
- `activateGiftCardPurchase(client, transaction, deps)` returns `{ handled: true, status: 'activated' | 'already_processed' | 'failed' | 'ignored' }` and owns callback idempotency.
- `renderGiftCardEmail(input)` returns `{ subject, text, html }`; `deliverGiftCardPurchase` sends to distinct buyer and recipient addresses and records delivery state.
- `createPaymobIntention` gains optional `specialReference?: string`; existing callers continue to default it to `orderReference`.

- [ ] **Step 1: Write service tests in RED.** Cover pending purchase row creation, fixed/custom amount validation, opaque public response, Paymob amount/reference/redirect payload, successful activation only after verified callback input, provider amount mismatch, failed payment without card creation, duplicate successful callback without a second card/issue transaction, and delivery failure leaving the card active with failed delivery state.

```ts
expect(await activateGiftCardPurchase(client, successTransaction, deps)).toMatchObject({ handled: true, status: 'activated' });
expect(calls.filter((call) => call.table === 'gift_cards' && call.op === 'insert')).toHaveLength(1);
expect(calls.filter((call) => call.table === 'gift_card_transactions' && call.op === 'insert')).toHaveLength(1);
```

- [ ] **Step 2: Write email tests in RED.** Render EN, AR, and FR buyer/recipient messages with amount, expiry, recipient name, message, and the full code. Assert the code is present only in the rendered email passed to the mail transport and never in purchase/list response objects. Assert identical buyer/recipient addresses are delivered once.

- [ ] **Step 3: Write route tests in RED.** Assert unauthenticated purchase requests can create a pending purchase, invalid amount/input returns 400, Paymob failure marks the purchase failed, the response contains only `purchaseReference` and `checkoutUrl`, and no response body contains the code. Assert the purchase result page handles pending, paid, and failed references without querying or showing plaintext codes.

- [ ] **Step 4: Run the focused tests to confirm RED.**

Run: `npm test -- --run tests/domain/gift-card-service.test.ts tests/domain/gift-card-purchase-email.test.ts tests/routes/gift-card-purchases.test.ts`

Expected: FAIL because the purchase service, email renderer, and routes do not exist.

- [ ] **Step 5: Implement the repository and purchase service.** Insert normalized sender/recipient data with status `pending`; call Paymob with `special_reference: giftcard:<purchase-id>`, `notification_url` set to `/api/webhooks/paymob`, and a gift-card result redirect. Mark intention failures as `failed` and never issue a card.

- [ ] **Step 6: Implement callback activation.** In the verified webhook branch, resolve `gift_card_purchases` by exact `giftcard:` reference, compare `amount_cents` to `amount_minor`, treat `paid` as idempotent success, generate/encrypt/hash a new code only for a new successful payment, insert the card and `issue` transaction, then mark the purchase `paid`. Use a provider-reference/idempotency key unique to the callback. Failed callbacks mark the purchase `failed` and create no card. Delivery is best effort after card activation.

- [ ] **Step 7: Implement email delivery and customer pages.** Use the existing Gmail transport interface, localized email templates, server-only decryption, and purchase delivery state. Add fixed denomination/custom amount inputs, sender/recipient fields, message, accessible errors, and a result page that never exposes code data.

- [ ] **Step 8: Make the webhook branch precede change/order matching but follow HMAC/refund-callback guards.** A non-gift-card callback must continue through the existing change and order branches unchanged. A malformed/unknown gift-card reference returns a safe received response without mutating unrelated orders.

- [ ] **Step 9: Run focused tests and lint.**

Run: `npm test -- --run tests/domain/gift-card-service.test.ts tests/domain/gift-card-purchase-email.test.ts tests/routes/gift-card-purchases.test.ts tests/domain/paymob-client.test.ts && npm run lint`

Expected: all focused and existing Paymob-client tests pass.

- [ ] **Step 10: Commit the purchase flow.**

```bash
git add features/gift-cards features/payment/types.ts features/payment/paymob-client.ts app/api/webhooks/paymob/route.ts 'app/[locale]/[city]/gift-cards' app/api/gift-cards tests/domain/gift-card-service.test.ts tests/domain/gift-card-purchase-email.test.ts tests/routes/gift-card-purchases.test.ts
git commit -m "feat: add paid gift card purchases"
```

---

### Task 3: Add server-authoritative gift-card quotes and checkout redemption

**Files:**
- Modify: `features/checkout/types.ts`
- Modify: `features/checkout/validation.ts`
- Modify: `features/checkout/CheckoutForm.tsx`
- Modify: `features/order/types.ts`
- Modify: `features/order/order-insert.ts`
- Modify: `features/order/supabase-repository.ts`
- Modify: `features/order/provider.ts`
- Modify: `app/api/orders/route.ts`
- Test: `tests/domain/gift-card-service.test.ts`
- Test: `tests/domain/order-insert.test.ts`
- Test: `tests/routes/orders.test.ts`
- Create: `tests/domain/checkout-gift-card.test.ts`

**Interfaces:**
- `quoteGiftCard(client, { code, orderTotalMinor, now })` returns `{ ok: true, codeLast4, amountAppliedMinor, remainingTotalMinor }` or a generic `{ ok: false, error: 'invalid_gift_card' }`.
- `holdGiftCardForOrder(client, { code, orderId, amountMinor })` returns `{ ok: true, holdId } | { ok: false, error: 'invalid_gift_card' }`.
- `PendingOrder` gains `giftCardMinor`, `giftCardId`, `giftCardHoldId`, and `giftCardCodeLast4` fields where available; `CreatePendingOrderInput.checkout.giftCardCode` is optional.

- [ ] **Step 1: Write quote and checkout RED tests.** Cover active/expired/depleted/void/insufficient cards, partial application, delivery-inclusive totals, promo plus gift card without negative totals, malformed codes with generic errors, and absent Supabase preserving the local repository. Assert only `codeLast4` and amounts are returned to the browser.

```ts
expect(await quoteGiftCard(client, { code: 'ROSE-ABCD-1234', orderTotalMinor: 120000, now })).toEqual({ ok: true, codeLast4: '1234', amountAppliedMinor: 75000, remainingTotalMinor: 45000 });
expect((await quoteGiftCard(client, invalidInput)).error).toBe('invalid_gift_card');
```

- [ ] **Step 2: Write order insert and route RED tests.** Assert `buildOrderInsertRow` includes only `gift_card_minor`, `gift_card_id`, `gift_card_hold_id`, and `gift_card_code_last4`; no full code. Assert the Paymob intention amount is the post-redemption total. Assert a zero total returns an order without `checkoutUrl` and creates no Paymob intention.

- [ ] **Step 3: Run focused tests to confirm RED.**

Run: `npm test -- --run tests/domain/checkout-gift-card.test.ts tests/domain/order-insert.test.ts tests/routes/orders.test.ts`

Expected: new gift-card cases fail while the pre-existing order tests continue to pass.

- [ ] **Step 4: Implement server-side quote and hold orchestration.** Normalize/hash the submitted code, fetch current balance through the service-role boundary, cap application at the authoritative order total, and apply the existing promo discount without allowing a negative total. Create the order with the masked/reference fields, then invoke `reserve_gift_card`; if reservation fails, delete the newly created order and return the generic invalid-code result. Return the hold ID in `PendingOrder` for later release/finalization.

- [ ] **Step 5: Extend checkout UI.** Add an optional accessible gift-card input and Apply/quote interaction. Display only masked code, applied amount, and reduced total. Keep promo and gift-card errors generic and preserve existing checkout fields/payment selection. Send the code only in the order request body; never persist it in React state beyond the input or include it in a redirect.

- [ ] **Step 6: Integrate Paymob amount and failure cleanup.** In `app/api/orders/route.ts`, pass the already reduced `order.totalMinor` to Paymob. If intention creation throws, release the gift-card hold before returning the existing temporary-unavailable response. If no Paymob configuration exists, preserve current demo behavior without attempting gift-card database operations in the local provider.

- [ ] **Step 7: Implement zero-total finalization.** When a live Supabase order total is zero, call `redeem_gift_card_hold` with idempotency key `gift-card-zero:<order-id>`, insert an amount-zero internal payment marker if needed by existing order status constraints, update the order to `paid`, and continue the normal confirmation notification path. Never call Paymob for a zero total.

- [ ] **Step 8: Run focused tests, full tests for affected paths, and lint.**

Run: `npm test -- --run tests/domain/checkout-gift-card.test.ts tests/domain/order-insert.test.ts tests/routes/orders.test.ts tests/domain/gift-card-service.test.ts && npm run lint`

Expected: all gift-card checkout cases, existing order tests, and TypeScript checks pass.

- [ ] **Step 9: Commit checkout redemption.**

```bash
git add features/checkout features/order app/api/orders/route.ts tests/domain/checkout-gift-card.test.ts tests/domain/order-insert.test.ts tests/routes/orders.test.ts
git commit -m "feat: redeem gift cards at checkout"
```

---

### Task 4: Convert, release, and restore gift-card balances across payment lifecycle

**Files:**
- Modify: `app/api/webhooks/paymob/route.ts`
- Modify: `features/orders/cancel-actions.ts`
- Modify: `features/gift-cards/service.ts`
- Test: `tests/domain/gift-card-service.test.ts`
- Create: `tests/routes/paymob-webhook.test.ts`
- Test: `tests/domain/cancel-actions.test.ts`

**Interfaces:**
- `handleGiftCardPaymentCallback(client, transaction, deps)` converts a held balance to a redemption only for a verified successful callback with the exact remaining Paymob amount; failed callbacks release the hold.
- `restoreGiftCardForCancelledOrder(client, { orderId, actorId })` performs one idempotent refund transaction and returns `'restored' | 'already_restored' | 'not_applicable' | 'failure'`.

- [ ] **Step 1: Write RED lifecycle tests.** Cover successful callback redemption, failed callback release, callback amount mismatch, duplicate callback no-op, expired hold release, Paymob failure releasing a hold, and exact cancellation restoration. Assert balance/status/transaction/idempotency-key mutations.

- [ ] **Step 2: Write cancellation RED tests.** A paid order with a redeemed gift card must restore the gift-card amount exactly once when approval succeeds. If gift-card restoration fails, approval remains pending and the order remains paid. A card-only zero-total cancellation must restore the card without attempting a Paymob refund. A non-gift-card order must preserve the current cancellation behavior.

- [ ] **Step 3: Run focused tests to confirm RED.**

Run: `npm test -- --run tests/domain/gift-card-service.test.ts tests/domain/cancel-actions.test.ts tests/routes/paymob-webhook.test.ts`

Expected: new lifecycle cases fail before callback/refund integration exists.

- [ ] **Step 4: Implement callback conversion.** After the existing HMAC verification and gift-card purchase resolution, use the purchase's order/hold linkage and the provider result to call the atomic redeem/release RPC. Record the Paymob payment idempotency marker before/with the state transition so a retried callback cannot decrement twice. Keep callback responses successful after a delivery failure.

- [ ] **Step 5: Integrate cancellation restoration.** Extend the cancellation order select with gift-card fields and transaction/hold data. For paid orders, restore the gift-card redemption through its idempotent service and refund only the Paymob remainder through the existing Paymob refund helper. For zero-total orders, skip Paymob. Do not mark the cancellation request approved or order refunded until every applicable monetary mutation succeeds; preserve the current retry-safe pending behavior.

- [ ] **Step 6: Run focused and full payment/cancellation tests.**

Run: `npm test -- --run tests/domain/gift-card-service.test.ts tests/domain/cancel-actions.test.ts tests/domain/paymob-refund.test.ts tests/routes/paymob-webhook.test.ts && npm run lint`

Expected: all lifecycle and existing refund tests pass.

- [ ] **Step 7: Commit payment lifecycle integration.**

```bash
git add app/api/webhooks/paymob/route.ts features/orders/cancel-actions.ts features/gift-cards/service.ts tests/domain/gift-card-service.test.ts tests/domain/cancel-actions.test.ts tests/routes/paymob-webhook.test.ts
git commit -m "feat: settle gift card balances with payments"
```

---

### Task 5: Add the admin gift-card operations surface

**Files:**
- Create: `features/gift-cards/admin-actions.ts`
- Create: `features/gift-cards/AdminGiftCardForm.tsx`
- Create: `features/gift-cards/AdminGiftCardActions.tsx`
- Create: `app/api/admin/gift-cards/route.ts`
- Create: `app/admin/gift-cards/page.tsx`
- Modify: `components/admin/AdminShell.tsx`
- Modify: `components/admin/AppSidebar.tsx`
- Test: `tests/domain/gift-card-admin.test.ts`
- Test: `tests/routes/gift-card-admin.test.ts`
- Test: `tests/components/AdminGiftCardForm.test.tsx`

**Interfaces:**
- `listGiftCards(client, identity, filters)` returns masked rows only: `id`, `codeLast4`, balance, initial amount, status, expiry, recipient/buyer email, source, and timestamps.
- `issueGiftCard(client, identity, input, deps)` generates/encrypts the code server-side, inserts the card plus `issue` ledger entry, sends delivery when an email exists, and returns only a masked row.
- `voidGiftCard(client, identity, cardId)` refuses conflicting active holds and writes a `void` ledger/audit row.
- `resendGiftCard(client, identity, cardId, deps)` decrypts only inside the server delivery call, updates attempts/state, and returns a generic result.
- `listGiftCardTransactions(client, identity, cardId)` returns masked transaction metadata (`type`, `amountMinor`, `orderId`, `idempotencyKey` redacted to a safe suffix, actor, and timestamp) without ciphertext or code values.


- [ ] **Step 1: Write RED admin service tests.** Cover admin/operator success, customer forbidden with zero writes, input validation, masked list output, issue ledger/audit, void refusal for held/redeemed balances, idempotent void, resend delivery success/failure, and no plaintext code in returned values or audit metadata.

- [ ] **Step 2: Write RED route and component tests.** Assert unauthenticated/non-admin requests return 403, valid actions map to stable HTTP responses, the page shows status/balance/expiry/recipient and last-four masking, transaction history is masked, and forms submit fixed/custom amounts with accessible errors. Assert no component receives a full card code prop.

- [ ] **Step 3: Run focused tests to confirm RED.**

Run: `npm test -- --run tests/domain/gift-card-admin.test.ts tests/routes/gift-card-admin.test.ts tests/components/AdminGiftCardForm.test.tsx`

Expected: FAIL because the admin service, route, page, and components do not exist.

- [ ] **Step 4: Implement authorization and admin actions.** Reuse `getCurrentAdmin`/`AdminIdentity`; permit `admin` and `operator` roles, use service-role reads/writes, write `admin_audit_logs` for `issue_gift_card`, `void_gift_card`, and `resend_gift_card`, and use generic errors for unauthorized/missing cards. Filter/search only against masked code suffix and non-secret metadata. Implement `listGiftCardTransactions` with a safe idempotency-key suffix and no code/ciphertext fields.

- [ ] **Step 5: Implement the admin page and navigation.** Add `/admin/gift-cards` to `AdminShell` and a gift-card icon to `AppSidebar`. Render issuance form, searchable list, balance/status badges, expiry, source, transaction-history section powered by `listGiftCardTransactions`, and void/resend controls. Never render or serialize code ciphertext or decrypted code.

- [ ] **Step 6: Run focused tests and lint.**

Run: `npm test -- --run tests/domain/gift-card-admin.test.ts tests/routes/gift-card-admin.test.ts tests/components/AdminGiftCardForm.test.tsx && npm run lint`

Expected: all admin tests pass and TypeScript remains clean.

- [ ] **Step 7: Commit admin operations.**

```bash
git add features/gift-cards/admin-actions.ts features/gift-cards/AdminGiftCardForm.tsx features/gift-cards/AdminGiftCardActions.tsx app/api/admin/gift-cards/route.ts app/admin/gift-cards/page.tsx components/admin/AdminShell.tsx components/admin/AppSidebar.tsx tests/domain/gift-card-admin.test.ts tests/routes/gift-card-admin.test.ts tests/components/AdminGiftCardForm.test.tsx
git commit -m "feat: add admin gift card operations"
```

---

### Task 6: Add localization, documentation, and complete regression coverage

**Files:**
- Modify: `features/i18n/dictionaries.ts`
- Modify: `docs/setup/runbook.md`
- Modify: `docs/operations/payments-email-chat.md`
- Test: `tests/domain/i18n-dictionary.test.ts`
- Test: `tests/components/GiftCardPurchaseForm.test.tsx`
- Test: `tests/domain/gift-card-purchase-email.test.ts`
- Create: `tests/domain/gift-card-regression.test.ts`

**Interfaces:**
- New UI keys must exist in all three locale dictionaries and have non-empty values.
- Documentation must identify migration `016`, `GIFT_CARD_SECRET`, the fixed/custom amount policy, Paymob `giftcard:` callback behavior, zero-total path, delivery retry behavior, and SQL checks for card balances/transactions.

- [ ] **Step 1: Write RED dictionary regression tests.** Add the complete key list for purchase page, purchase result, checkout, admin operations, statuses, errors, masked-code labels, and delivery states. Assert EN/AR/FR each define every key.

- [ ] **Step 2: Add localized copy and update operations docs.** Keep customer-facing copy translated in EN/AR/FR; document that transactional email is unaffected, codes are never shown in browser/admin responses, and a paid card remains valid when email delivery fails. Update migration order and setup tables without leaving the old stale test-count claim in the runbook.

- [ ] **Step 3: Add integration regression tests.** Cover the complete pure flow: purchase input → Paymob special reference → successful activation → masked quote → hold → redemption/release → cancellation restoration. Include a no-Supabase provider test proving local checkout behavior remains unchanged and a test proving ordinary order Paymob payloads still use their display number.

- [ ] **Step 4: Run focused and complete verification.**

Run:

```bash
npm test -- --run tests/domain/i18n-dictionary.test.ts tests/components/GiftCardPurchaseForm.test.tsx tests/domain/gift-card-purchase-email.test.ts tests/domain/gift-card-regression.test.ts
npm test
npm run lint
npm run build
git diff --check
```

Expected: all tests pass, TypeScript/lint pass, the gift-card purchase/admin routes compile, and the build does not emit tracked changes beyond generated `next-env.d.ts` (restore that generated file if needed before commit).

- [ ] **Step 5: Run the repository secret scan.** Confirm no test fixture, migration, log, or rendered component contains a real credential or plaintext production gift-card code.

- [ ] **Step 6: Commit docs/localization/regressions.**

```bash
git add features/i18n/dictionaries.ts docs/setup/runbook.md docs/operations/payments-email-chat.md tests/domain/i18n-dictionary.test.ts tests/components/GiftCardPurchaseForm.test.tsx tests/domain/gift-card-purchase-email.test.ts tests/domain/gift-card-regression.test.ts
git commit -m "docs: document gift card operations and verification"
```

---

## Final review checklist

- [ ] Every public purchase and checkout response contains no plaintext gift-card code.
- [ ] HMAC, amount, callback reference, and idempotency checks happen before state mutation.
- [ ] A duplicate Paymob callback cannot issue or redeem twice.
- [ ] A failed Paymob intention releases the gift-card hold.
- [ ] A failed Paymob payment releases the hold; a successful callback redeems it.
- [ ] Zero-total orders never call Paymob and still finalize the hold exactly once.
- [ ] Cancellation restores the gift-card portion exactly once and refunds only the Paymob portion.
- [ ] Admin list/search, issue, void, resend, and audit actions reveal only masked data.
- [ ] Email delivery reaches both distinct buyer and recipient addresses and records retryable failures.
- [ ] Expired cards and expired holds cannot be used.
- [ ] EN/AR/FR UI and email copy are complete.
- [ ] Local/demo checkout remains unchanged without Supabase.
- [ ] `npm test`, `npm run lint`, `npm run build`, `git diff --check`, and secret scan are green.
