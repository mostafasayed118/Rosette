# Rosette gift cards — design

**Date:** 2026-08-20
**Status:** Approved for implementation planning

## Goal

Allow customers to buy digital gift cards and allow admins to issue them for
promotions or service recovery. Gift cards must activate only after a verified
Paymob payment, redeem atomically against one normal flower order, preserve
remaining balance, and maintain an auditable money ledger.

## Locked v1 decisions

- **Scope:** public gift-card sales plus admin issuance.
- **Delivery:** after successful payment, send the full code to both the buyer
  and recipient. Admin-issued cards use the same delivery adapter when email
  addresses are provided.
- **Amounts:** fixed denominations plus a custom amount bounded by configured
  minimum and maximum values.
- **Redemption:** one gift card per order, partial redemption allowed, remaining
  balance retained, no stacking, no cash redemption.
- **Coverage:** gift-card value may cover merchandise and delivery fees.
- **Expiry:** 12 months from activation/issuance.
- **Payment:** Paymob is the live purchase path. A zero-total order after
  redemption does not create a Paymob intention.
- **Security:** plaintext codes are never stored in ordinary columns, orders,
  logs, or browser responses. The database stores a keyed code hash for
  lookup and an encrypted ciphertext solely so authorized server-side resend
  flows can recover the code.

## Architecture and data model — migration `016_gift_cards.sql`

### `gift_card_purchases`

A pending purchase exists before Paymob redirects the buyer:

- `id uuid primary key default gen_random_uuid()`
- `reference text not null unique` — `GC-<id>` or an equivalent opaque merchant reference
- `amount_minor integer not null check (amount_minor > 0)`
- `currency text not null default 'EGP'`
- sender: `sender_name`, `sender_email`
- recipient: `recipient_name`, `recipient_email`
- `message text not null default ''`
- `locale text not null check (locale in ('en','ar','fr'))`
- `status text not null check (status in ('pending','paid','failed','cancelled'))`
- `provider_reference text unique`
- `delivery_status text not null default 'pending' check (delivery_status in ('pending','sent','failed'))`
- `delivery_attempts integer not null default 0`
- `last_delivery_error text`
- timestamps

### `gift_cards`

The spendable instrument:

- `id uuid primary key default gen_random_uuid()`
- `purchase_id uuid references gift_card_purchases(id)` nullable for admin-issued cards
- `code_hash text not null unique`
- `code_ciphertext text not null` — AES-GCM ciphertext produced with the
  server-only `GIFT_CARD_SECRET`; only server-side delivery/resend code can decrypt it
- `code_last4 text not null`
- `initial_balance_minor integer not null check (initial_balance_minor > 0)`
- `balance_minor integer not null check (balance_minor >= 0)`
- `recipient_name`, `recipient_email`, `buyer_email`
- `status text not null check (status in ('active','depleted','expired','void'))`
- `expires_at timestamptz not null`
- `issued_by uuid references profiles(id)` nullable
- `activated_at timestamptz not null default now()`
- timestamps

Unique purchase linkage and code hash uniqueness make callback activation
idempotent.

### `gift_card_holds`

Reservations prevent concurrent checkout spending:

- `id uuid primary key default gen_random_uuid()`
- `gift_card_id uuid not null references gift_cards(id)`
- `order_id uuid not null references orders(id) on delete cascade`
- `amount_minor integer not null check (amount_minor > 0)`
- `status text not null check (status in ('held','redeemed','released'))`
- `expires_at timestamptz not null`
- timestamps
- unique active hold per order and gift card

### `gift_card_transactions`

Append-only audit ledger:

- `id uuid primary key default gen_random_uuid()`
- `gift_card_id uuid not null references gift_cards(id)`
- `type text not null check (type in ('issue','redeem','release','void','refund'))`
- `amount_minor integer not null check (amount_minor > 0)`
- `order_id uuid references orders(id)` nullable
- `actor_id uuid references profiles(id)` nullable
- `idempotency_key text not null unique`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz not null default now()`

Add nullable order columns:

- `gift_card_minor integer not null default 0 check (gift_card_minor >= 0)`
- `gift_card_id uuid references gift_cards(id)`
- `gift_card_hold_id uuid references gift_card_holds(id)`
- `gift_card_code_last4 text`

All gift-card tables use RLS with no public policies. Reads/writes go through
the service-role client, except no gift-card code is ever exposed through a
public database query.

## Cryptography and code lifecycle

Add server-only `GIFT_CARD_SECRET` to the environment allowlist and `.env.example`.
Use it for both:

- keyed code hashes (`HMAC-SHA256(secret, normalizedCode)`) used for redemption;
- authenticated encryption of the generated code for server-only delivery and
  admin resend.

Codes are generated only after verified payment for public purchases, or during
an authorized admin issuance. The server may decrypt a code only immediately
before sending a delivery email. It must never put the plaintext in an order
row, API response, audit metadata, console log, or client component.

## Gift-card purchase flow

### Customer page and route

Add a localized `/[locale]/[city]/gift-cards` page with a form for:

- fixed denomination or custom amount
- sender name/email
- recipient name/email
- message
- optional locale/delivery copy

The server route `POST /api/gift-cards/purchases` validates input, creates a
pending purchase, and creates a Paymob intention with:

- amount = selected amount in minor units;
- `special_reference = giftcard:<purchase-id>`;
- notification URL = existing Paymob webhook;
- redirect URL = a gift-card purchase result page.

The response returns only the checkout URL and public purchase reference. It
never returns a gift-card code.

### Verified callback

Update the Paymob webhook to recognize `special_reference` beginning with
`giftcard:` before the ordinary order branch. The existing HMAC verification
runs first. The gift-card callback service:

1. Resolves the purchase by reference and validates the provider amount.
2. Treats an already-paid purchase as an idempotent success.
3. On a successful, new payment, generates the code, encrypts it, stores the
   keyed hash/ciphertext, creates the issue transaction, marks the purchase
   paid, and sends both delivery emails.
4. On a failed payment, marks the purchase failed and creates no card.
5. Records provider reference/idempotency data so duplicate callbacks cannot
   issue a second card.

Delivery failure does not roll back the paid card. It increments delivery
failure state for a future resend and returns a successful callback response.

## Checkout redemption flow

Extend checkout input with an optional `giftCardCode` and add a server-side
validation/quote service:

- normalize the code and compute its keyed hash;
- reject missing, malformed, void, depleted, or expired cards;
- release expired holds before calculating available balance;
- apply `min(availableBalance, merchandise + delivery total)`;
- allow the result to be zero;
- combine with the existing promo discount without making totals negative;
- return only masked information such as `codeLast4`, amount applied, and new
  total to the browser.

At live order creation:

1. Authoritative product/delivery/promo totals are calculated as today.
2. The order row is created with the gift-card amount and card reference.
3. A Postgres function atomically reserves the requested card amount into a
   `gift_card_holds` row; if it fails, the order is removed and checkout gets a
   generic invalid-gift-card result.
4. Inventory is reserved and the Paymob intention is created for the remaining
   amount.
5. If Paymob intention creation fails, the hold is released before returning.
6. Verified payment success converts the hold to a redemption transaction and
   decrements `balance_minor`; the card becomes `depleted` at zero.
7. Verified payment failure releases the hold.
8. Cancellation/refund of an order with a gift-card redemption creates a
   compensating refund transaction and restores the card balance exactly once.

A zero-total order bypasses Paymob, finalizes the hold as redeemed, marks the
order paid through the existing trusted server path, and continues ordinary
order confirmation/notification behavior.

The local/demo repository remains unchanged; absent Supabase it keeps the
existing mock checkout behavior.

## Gift-card email delivery

Add `features/gift-cards/gift-card-email.ts` with bilingual/trilingual rendering
for both buyer and recipient:

- gift-card amount and expiry
- recipient name and buyer message
- full code
- storefront redemption instructions
- no payment secrets or internal IDs

Use the existing Gmail transport and an injected fake in tests. Delivery state
is recorded on the purchase/card workflow, and the admin resend action uses the
encrypted code only inside server-side email delivery.

## Admin surface

Add `/admin/gift-cards` and admin service/actions:

- list/search cards by masked code, recipient, email, status, expiry, and balance;
- issue a card manually with amount and recipient/buyer details;
- void a card only when its remaining balance is not already redeemed in a
  conflicting hold;
- resend the delivery email;
- show transaction history and source (`purchase` or `admin`);
- write `admin_audit_logs` rows for issue, void, resend, and manual actions.

Only admin/operator roles may issue, void, resend, or view card records.
Customer-facing routes reveal no admin data or code history.

## Error handling and privacy

- Invalid codes return a generic validation error and never reveal whether a
  code exists.
- All balance mutations happen through atomic database functions and an
  idempotency key.
- Expired holds are released during quote/reservation and cannot be redeemed.
- Paymob callbacks are verified before any gift-card state mutation.
- Duplicate callbacks and duplicate cancellation/refund events are safe.
- Email failure does not invalidate paid value; it creates a retryable delivery
  state.
- No gift-card code is logged, returned from an order API, or stored in an
  unencrypted ordinary column.

## Testing

Add focused tests for:

1. amount validation: fixed denominations, custom min/max, integer minor units;
2. code generation, normalization, HMAC hashing, encryption/decryption, and
   masked-code display;
3. purchase input validation and Paymob intention payload/reference;
4. successful callback activation, failed callback, amount mismatch, duplicate
   callback, and delivery failure;
5. gift-card quote for active/expired/depleted/void cards and partial balance;
6. atomic hold, redeem, release, expiry, and idempotency behavior;
7. order creation with gift-card amount and remaining Paymob amount;
8. zero-total checkout and Paymob failure hold release;
9. cancellation/refund restoration exactly once;
10. gift-card email copy and code delivery to both addresses;
11. admin authorization, issue/void/resend actions, audit rows, and masked list;
12. all new EN/AR/FR dictionary keys.

Final verification: `npm test`, `npm run lint`, `npm run build`,
`git diff --check`, and the repository secret scan.

## Explicit non-goals

- No physical gift cards.
- No multiple-card stacking.
- No cash withdrawal or cash refunds.
- No customer-to-customer transfers after issuance.
- No scheduled future delivery in v1; both emails send after successful payment.
- No gift-card purchase through the ordinary flower cart.
