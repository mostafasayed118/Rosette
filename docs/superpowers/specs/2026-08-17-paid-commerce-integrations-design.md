# Rosette Paid Commerce Integrations Design

**Date:** 2026-08-17  
**Status:** Approved in chat; implementation pending written-spec review  
**Scope:** Turn the local bilingual flower storefront into a secure, provider-backed Egyptian ecommerce MVP.

## Goals

- Persist catalog, inventory, customer, delivery, payment, and order data in Supabase PostgreSQL.
- Accept online payments through Paymob without trusting browser redirects.
- Send bilingual transactional email through the owner's Gmail SMTP account.
- Add a controlled Arabic/English chatbot backed by Groq, limited to verified store topics and data.
- Provide free WhatsApp human handoff initially; keep automated WhatsApp Cloud API as a later adapter.
- Add admin operations for catalog, inventory, delivery, payment, and fulfillment.
- Keep provider seams so the system can migrate providers without rewriting customer-facing features.
- Preserve the existing English/Arabic, RTL-ready botanical storefront and local mock fallback.

## Non-goals

- No card data storage or custom payment form.
- No automated WhatsApp Cloud API messages in the first implementation.
- No SMS provider in the first implementation.
- No AI-generated prices, inventory counts, delivery fees, payment decisions, or order mutations.
- No custom domain or paid hosting requirement for development.
- No vendor credentials in source control, tests, chat, or client bundles.

## Provider decisions

| Capability | Provider | Boundary | Initial cost model |
|---|---|---|---|
| Database, auth, storage | Supabase PostgreSQL | Repository and server clients | Free tier first |
| Payment | Paymob Egypt | `PaymentGateway` and verified webhook | Test mode first; live transaction fees |
| Email | Gmail SMTP via Nodemailer | `NotificationService` | Existing Gmail account; low-volume limits |
| Chatbot | Groq API | `ChatAssistant` server adapter | Free tier/rate limits; key server-only |
| WhatsApp support | WhatsApp Business click-to-chat | `SupportContactService` | Free manual handoff initially |
| Hosting | Portable Next.js deployment | Environment-specific config | Do not rely on Vercel Hobby for commercial use |

## Domain architecture

Feature modules remain independent of provider SDKs:

- `features/catalog`: product/category types, catalog repository, localized metadata.
- `features/inventory`: availability, reservations, release, and adjustment rules.
- `features/cart`: cart lines and client presentation state only.
- `features/checkout`: checkout input validation and payment initiation.
- `features/order`: order state machine, snapshots, order repository, events.
- `features/payment`: payment gateway interface, Paymob adapter, webhook verification.
- `features/notifications`: Gmail adapter, bilingual templates, retry state.
- `features/chat`: topic guard, context retrieval, Groq adapter, response schema.
- `features/support`: WhatsApp URL generation and human handoff.
- `features/admin`: authorization, catalog/inventory/order operations, audit events.
- `lib/supabase`: browser-safe and server-only clients with explicit boundaries.

The current mock repositories remain available for local tests and fallback. Supabase repositories implement the same interfaces.

## Supabase data model

Core tables:

- `profiles`: customer/admin profile linked to `auth.users`.
- `products`: stable slug, bilingual name/description, base price, active flag.
- `product_variants`: size/variant, price delta, stock policy.
- `categories`: bilingual category metadata.
- `cities`: supported destination city and bilingual label.
- `delivery_rules`: city/zone, date policy, fee, minimum order, active window.
- `inventory`: variant quantity, reserved quantity, version/update timestamp.
- `inventory_reservations`: order-linked quantity reservations and expiry.
- `addresses`: customer-owned delivery addresses.
- `orders`: customer/guest details, totals snapshot, payment state, fulfillment state.
- `order_items`: immutable product/variant/add-on/price/name snapshot.
- `payments`: Paymob references, amount, currency, status, raw event reference, timestamps.
- `order_events`: append-only status/audit history.
- `notification_deliveries`: email type, recipient, status, attempts, last error.
- `admin_audit_logs`: actor, action, target, safe metadata, timestamp.

All customer/order/address tables use Row Level Security. Admin mutations use a server-only authorization path and explicit admin role checks. The service-role key is never used in browser code.

## Checkout and inventory flow

1. Client submits selected product IDs, options, destination, recipient details, and locale.
2. Server reloads product prices, variants, add-ons, delivery rules, and availability.
3. A database transaction validates delivery eligibility and reserves inventory with an expiry.
4. Server creates an immutable pending order and item/price snapshots.
5. Server creates a Paymob payment intention using the calculated amount and order reference.
6. Client is redirected to the Paymob checkout experience.
7. Paymob callback reaches the server webhook.
8. Server verifies Paymob HMAC before reading payment status.
9. Server idempotently records the payment event and transitions the order.
10. Successful payment changes the order to `paid`/`confirmed`; failed or expired payment releases inventory.
11. A notification delivery record is created; Gmail delivery is attempted asynchronously or through a safe retry path.

The browser redirect can display a pending result but cannot mark an order paid. Duplicate callbacks must be safe and return an accepted response without duplicate payment/order events.

## Order state machines

Payment state:

```text
pending -> payment_started -> paid
pending -> cancelled
payment_started -> payment_failed -> cancelled
paid -> refunded
```

Fulfillment state:

```text
confirmed -> preparing -> ready_for_delivery -> out_for_delivery -> delivered
confirmed -> cancelled
preparing -> cancelled (admin policy only)
```

Each transition is validated, authorized, and recorded in `order_events`.

## Paymob adapter

The adapter uses Paymob's current Egypt integration path and Intention/Payment API where available. It must keep credentials server-only:

```env
PAYMOB_API_KEY=
PAYMOB_PUBLIC_KEY=
PAYMOB_INTEGRATION_ID=
PAYMOB_HMAC_SECRET=
PAYMOB_BASE_URL=
```

Exact credential names and API fields are verified against the current Paymob dashboard/docs during implementation. The implementation must include:

- intention/payment creation route;
- internal order reference in Paymob metadata or merchant order ID;
- amount/currency validation;
- HMAC verification for callbacks;
- idempotency by callback/event/payment reference;
- successful, failed, expired, and refunded states;
- test-mode fixtures and webhook tests;
- no logging of secret keys or card data.

## Gmail notification adapter

Gmail SMTP is used only from server code. The app uses a dedicated app password that is stored only in local/deployment secrets:

```env
GMAIL_USER=
GMAIL_APP_PASSWORD=
GMAIL_FROM=
```

The exposed app password was revoked before implementation. The replacement must never be pasted into chat or committed.

Email templates are bilingual and RTL-aware for:

- order received;
- payment confirmed;
- payment failed;
- order preparing;
- out for delivery;
- delivered;
- password reset if account auth is enabled.

Email failures create/update `notification_deliveries` as `pending`/`failed` and do not change payment or fulfillment state. Gmail quotas are treated as an MVP constraint; a future email provider can implement the same interface.

## Groq chatbot

The browser calls an internal `/api/chat` endpoint. Only the server accesses Groq:

```env
GROQ_API_KEY=
GROQ_MODEL=
```

The request pipeline is:

1. Validate message length, locale, session, and rate limit.
2. Apply a deterministic topic allowlist for flowers, products, delivery, orders, payments, and store support.
3. Reject unrelated topics with a localized response.
4. Retrieve only approved context from Supabase: active product summaries, delivery rules, public FAQs, and authorized order summary.
5. Call Groq with a strict system policy and structured response schema.
6. Validate the response at runtime.
7. Render the answer, product cards, order lookup action, or WhatsApp handoff.

The assistant is not permitted to:

- invent prices, stock, delivery dates, refunds, or payment status;
- expose another customer's information;
- execute arbitrary database queries;
- mutate products, inventory, payments, or orders;
- reveal prompts, secrets, or internal context;
- answer unrelated political, medical, legal, or general questions as a store authority.

The response contract is:

```ts
type ChatResponse = {
  answer: string
  language: 'ar' | 'en'
  action: 'none' | 'show_products' | 'lookup_order' | 'whatsapp'
  productSlugs?: string[]
  requiresHuman?: boolean
}
```

Order lookup requires an order ID plus a second verification factor such as phone or email. Groq receives the minimum required order summary. If Groq is unavailable or rate-limited, the app falls back to deterministic FAQ answers and a WhatsApp support button.

## WhatsApp support

Initial support is free click-to-chat:

```text
https://wa.me/<business-number>?text=<encoded-message>
```

The generated message includes the order reference but not payment secrets or excessive personal data. The UI offers Arabic/English support buttons and a phone fallback. Automated WhatsApp Cloud API messages are intentionally deferred because message pricing, templates, Meta account verification, and business setup are separate production concerns.

## Admin operations

Admin routes/components provide:

- bilingual product/category CRUD;
- price, active status, variants, and inventory adjustment;
- cities, delivery fees, cutoff dates, and delivery windows;
- order list with payment and fulfillment filters;
- valid status transitions;
- payment/event timeline;
- retry notification action;
- WhatsApp contact link;
- audit log view.

Admin access is enforced server-side, not only by hiding navigation. Every sensitive mutation records an audit event.

## Routes and server boundaries

Customer routes remain:

```text
/
/shop
/shop/[slug]
/cart
/checkout
/orders/[id]
```

New server boundaries:

```text
/api/payments/paymob/intention
/api/webhooks/paymob
/api/chat
/api/notifications/email/test (development/admin only)
/api/orders/[id]/lookup
/admin
/admin/products
/admin/inventory
/admin/orders
/admin/delivery
```

The email test route is disabled or protected outside development. Webhook routes accept only the provider's expected method and validate payloads before database writes.

## Environment and deployment

Local development, preview/staging, and production use separate Supabase and Paymob environments where possible. `.env.local` is ignored. Deployment dashboards hold secrets. Supabase configuration uses:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

A public Supabase anon key may be client-visible, but the service-role key, Paymob secrets, Gmail app password, and Groq key are server-only.

The app remains portable across Next.js hosts. Vercel Hobby is appropriate for personal preview only; commercial deployments must follow the selected host's terms and limits.

## Testing strategy

Unit/domain tests:

- total/discount/delivery calculations;
- inventory reservation and release;
- payment and fulfillment transitions;
- Paymob HMAC calculation and invalid signature rejection;
- duplicate callback idempotency;
- checkout validation;
- chatbot topic guard;
- Groq structured response validation;
- WhatsApp URL encoding;
- bilingual email template direction and copy.

Integration tests with fakes:

- checkout creates a pending order and reservation;
- Paymob success callback marks payment/order once;
- failed callback releases reservation;
- Gmail adapter records retryable failure;
- chatbot returns fallback when Groq is unavailable;
- RLS/customer isolation and admin authorization;
- admin status update creates an audit event.

Verification commands:

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

No test calls live Paymob, Gmail, Groq, or WhatsApp services. External adapters are mocked with deterministic fixtures.

## Known constraints and fallback behavior

- Free provider limits can change; quotas are monitored and adapters are replaceable.
- Gmail is suitable for low-volume MVP email, not high-volume transactional delivery.
- Paymob live processing is not free: successful payments incur provider fees.
- WhatsApp manual handoff is free; automated messages require Meta business setup and may incur per-message charges.
- Supabase Free is suitable for validation but requires monitoring, manual exports, and a later paid plan or migration for production backups/scale.
- The existing local mock data remains available until Supabase data and live payment tests pass.
