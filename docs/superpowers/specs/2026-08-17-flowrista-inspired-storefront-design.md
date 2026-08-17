# Botanical Gift Storefront Design Specification

**Date:** 2026-08-17  
**Status:** Approved in chat; awaiting written-spec review before implementation planning  
**Reference:** Public Flowrista website, https://www.flowrista.com/  
**Project:** Rosette

## 1. Purpose and boundaries

Rosette will be a polished, original flower-and-gift storefront inspired by the public customer journey observed on Flowrista. It is not a code, asset, copy, or brand clone. The implementation will use original naming, sample catalog content, and a tokenized visual system that captures the useful interaction patterns without reproducing protected creative assets.

The first release is a navigable local-data MVP. A customer can choose a delivery destination, browse a localized catalog, inspect a product, customize it, add it to a cart, complete a mock checkout, and view an order confirmation/status page. The implementation must make future production integrations possible without pretending that mock inventory or payment is real.

### In scope

- Responsive storefront shell and navigation.
- Destination country/city selection persisted locally.
- Localized mock product catalog with categories, search, filters, and sort.
- Product detail with variants, add-ons, message, and delivery eligibility.
- Cart with quantity and customization editing.
- Checkout form with recipient, sender, delivery date/window, address, and payment choice.
- Mock order creation, confirmation, and order status timeline.
- Loading, empty, unavailable, validation, and simulated-failure states.
- Design tokens saved in CSS variables and documented for theme changes.
- Unit/component/route smoke coverage for the core purchase path.

### Out of scope for the MVP

- User accounts, saved addresses, wishlist, reviews, subscriptions, or loyalty.
- Live payment capture, fraud checks, refunds, or payment webhooks.
- Live inventory, florist production scheduling, substitutions, or courier dispatch.
- Admin, florist, courier, or customer-support dashboards.
- CMS, multi-vendor onboarding, analytics platform, or marketing automation.
- Copying Flowrista's logo, photos, exact text, or proprietary implementation.

## 2. Public reference analysis

The public root page currently presents a destination gate with the prompt to select the country for sending a gift and a fallback request for countries not yet supported. It then asks for a delivery city; the visible options include Greater Cairo, Alexandria, Mansoura, Zagazig, Tanta, Menofya, North Coast, Ain Sokhna, Ismailia, Banha, and Suez.

Public search results expose a localized catalog pattern such as `/en/cairo-eg`, category routes such as `/search/category/hand-bouquet`, same-day delivery messaging, and a product universe containing flowers and gifts. The useful product decisions to retain are:

1. Ask for destination before showing a delivery-specific catalog.
2. Localize catalog and delivery expectations by city.
3. Make occasion/category discovery prominent.
4. Treat delivery timing as a first-class purchase concern.
5. Support gift personalization and add-ons.
6. Give the customer a clear post-purchase status path.

The reference extraction is limited to public pages and search-visible behavior. It is not a claim about Flowrista's private system, internal workflow, source code, data model, or vendor integrations.

## 3. Product experience

### 3.1 Customer journey

```text
Landing / destination gate
        |
        v
Destination selected and persisted
        |
        v
Catalog: search, occasion, filters, delivery promise
        |
        v
Product detail: variant + add-ons + message + date eligibility
        |
        v
Cart: review, edit, subtotal, delivery estimate
        |
        v
Checkout: recipient + sender + address + date/window + mock payment
        |
        v
Order created: confirmation number + status timeline
```

### 3.2 Destination gate

- `/` shows a warm editorial introduction and a destination selector.
- Country and city are required before delivery-specific actions are enabled.
- The selection is stored in local storage under a versioned key so stale shape changes can be migrated or discarded safely.
- An unsupported-country action displays a request-interest state rather than a dead end.
- A destination change from the header reopens the selector and warns that delivery eligibility and cart promises may change.

### 3.3 Catalog

- `/shop` reads destination and filter state.
- Filters are represented in URL search parameters so refresh, back/forward navigation, and shareable filtered views work.
- Supported filters: category, occasion, price range, color, availability, and delivery date.
- Sort options: recommended, newest, price low-to-high, and price high-to-low.
- Cards show image/fallback, name, short descriptor, starting price, delivery promise, and a favorite-looking but non-functional visual affordance only if it is clearly marked as future functionality. Prefer omitting it for the MVP.
- No results state offers filter reset and category navigation.

### 3.4 Product detail

- `/shop/[slug]` presents gallery, product name, description, price, available variants, add-ons, note/message, quantity, and delivery estimate.
- Invalid slugs render a useful not-found page with a link back to the catalog.
- Date eligibility is deterministic in the mock repository and should be shown before add-to-cart.
- Add-to-cart validates required variant and delivery information, then gives an accessible confirmation toast and cart count update.

### 3.5 Cart

- `/cart` renders line items with product snapshot, selected variant/add-ons, message, date, quantity, remove, and edit actions.
- Pricing is calculated from item price, variant delta, add-on price, quantity, and delivery fee. Money values are integer minor units; display formatting is centralized.
- Cart remains local across refreshes. Invalid/stale products are surfaced with an unavailable state rather than silently removed.
- Empty cart state links to `/shop`.

### 3.6 Checkout

- `/checkout` redirects to `/cart` if the cart is empty.
- Required fields: recipient name, recipient phone, delivery address, sender name, sender email, delivery date, delivery window, and payment method.
- A short optional greeting message is available per line item and is not confused with the required delivery address.
- Validation is field-specific, keyboard accessible, and preserves entered values after an error.
- Submit performs a local availability check, creates an order snapshot, simulates payment, and routes to `/orders/[id]`.
- Simulated payment failure leaves the cart intact and presents a retry action.

### 3.7 Order confirmation and status

- `/orders/[id]` shows a human-readable order number, destination, items, total, delivery promise, and status timeline.
- MVP status sequence: `draft`, `pending_payment`, `confirmed`, `preparing`, `out_for_delivery`, `delivered`; alternate terminal branches are `cancelled` and `failed`.
- The confirmation page must not imply real dispatch or payment capture; copy labels the experience as a demo order where appropriate.
- Unknown order IDs render a not-found state.

## 4. Visual and interaction system

### 4.1 Brand direction

The visual direction is botanical editorial: quiet ivory space, deep plant green, terracotta warmth, and product photography as the emotional focus. It should feel considered and giftable rather than like a generic marketplace. Use restrained borders and spacing instead of heavy shadows or excessive gradients.

### 4.2 Theme tokens

All feature styles consume these semantic tokens. Raw hex values should appear only in the token declaration.

```css
:root {
  --color-canvas: #f6f1ea;
  --color-surface: #fffdf9;
  --color-surface-muted: #eee6dc;
  --color-ink: #2a2a27;
  --color-ink-muted: #6c6a62;
  --color-brand: #173b33;
  --color-brand-hover: #0f2b25;
  --color-accent: #b85c45;
  --color-accent-soft: #f0d9cf;
  --color-border: #d9c7b7;
  --color-success: #356b4d;
  --color-warning: #9a6b27;
  --color-danger: #a33d37;

  --font-display: Georgia, 'Times New Roman', serif;
  --font-body: Arial, Helvetica, sans-serif;
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.75rem;
  --text-display: clamp(2.75rem, 7vw, 6.5rem);

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-24: 6rem;

  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-pill: 999px;
  --shadow-soft: 0 12px 32px rgb(42 42 39 / 8%);
  --content-max: 80rem;
}
```

The exact token values may be tuned during implementation only if the token names and semantic roles remain stable. A future theme can replace the variable values without changing feature components.

### 4.3 Typography and layout

- Display headings use the serif token; interface text, prices, metadata, and form labels use the sans token.
- Use a generous line-height for editorial text and compact line-height for prices and labels.
- Content is centered inside `--content-max` with responsive side padding.
- Desktop catalog: four columns where viewport permits; tablet: two; mobile: one or two depending on card minimum width.
- Desktop cart/checkout can use a two-column layout with a sticky summary; mobile stacks content and uses a persistent bottom action only where it does not obscure form fields.
- Use `clamp()` for hero/display type and avoid fixed heights for content-bearing sections.

### 4.4 Component states

Every interactive component must support default, hover, focus-visible, disabled, loading, success, and error states where applicable. Focus rings use an accessible high-contrast outline rather than relying on color shifts alone.

### 4.5 Responsive and localization requirements

- Mobile-first CSS.
- No interaction may depend on hover.
- Use logical CSS properties such as `margin-inline` and `padding-inline` to keep RTL support possible.
- Keep labels and buttons short enough to accommodate Arabic expansion.
- The MVP may ship English copy first, but all customer-facing strings should be centralized rather than embedded throughout components.
- Respect `prefers-reduced-motion`; no essential information may depend on animation.

## 5. System architecture

### 5.1 Framework and rendering

Use Next.js App Router with TypeScript. Server components should own static/catalog reads where practical. Client components should be limited to local interaction boundaries: destination modal, filters, cart editing, checkout form, toasts, and transient UI state.

### 5.2 Route map

| Route | Responsibility |
|---|---|
| `/` | Destination-aware landing and destination gate |
| `/shop` | Catalog, URL filters, empty/loading/error states |
| `/shop/[slug]` | Product detail and customization |
| `/cart` | Local cart review and edit |
| `/checkout` | Validated mock checkout |
| `/orders/[id]` | Confirmation and status timeline |

### 5.3 Feature boundaries

- `features/destination`: destination types, selector, persistence, eligibility helpers.
- `features/catalog`: product/category types, repository, filters, cards, catalog page sections.
- `features/product`: product detail and customization state.
- `features/cart`: cart types, pricing, persistence, line item UI.
- `features/checkout`: form schema, validation, submission state, checkout UI.
- `features/order`: order types, mock creation, confirmation, timeline.
- `components/ui`: generic button, input, select, modal, badge, toast, skeleton, and empty-state primitives.
- `lib`: formatting, local-storage helpers, route utilities, and shared result types.
- `data`: mock products, cities, delivery rules, and category metadata.

No feature should import another feature's internals. Cross-feature behavior is exposed through small typed functions or shared domain types.

### 5.4 Adapter interfaces

These interfaces are intentionally local and vendor-neutral:

```ts
interface CatalogRepository {
  list(input: CatalogQuery): Promise<CatalogPage>;
  getBySlug(slug: string): Promise<Product | null>;
  isDeliverable(input: DeliveryEligibilityInput): Promise<DeliveryEligibility>;
}

interface OrderRepository {
  create(input: CreateOrderInput): Promise<Result<Order, OrderError>>;
  getById(id: string): Promise<Order | null>;
}

interface PaymentGateway {
  authorize(input: PaymentInput): Promise<Result<PaymentAuthorization, PaymentError>>;
}

interface DeliveryService {
  quote(input: DeliveryQuoteInput): Promise<DeliveryQuote>;
}
```

The MVP implementations are deterministic local adapters. Real database, payment, notification, and courier services can replace the adapters without changing page-level components.

### 5.5 State and persistence

- URL search params: catalog filters and sort.
- `localStorage`: versioned destination and cart records.
- React component state: modal, form, loading, toast, and submission state.
- No state-management dependency is needed for the first release.
- All local-storage reads are client-only and must tolerate malformed/old values by returning safe defaults.

### 5.6 Order data shape

```ts
type OrderStatus =
  | 'draft'
  | 'pending_payment'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'failed';

type Order = {
  id: string;
  displayNumber: string;
  destination: Destination;
  items: CartLine[];
  recipient: RecipientDetails;
  sender: SenderDetails;
  delivery: DeliveryDetails;
  totals: OrderTotals;
  payment: { method: PaymentMethod; status: 'pending' | 'authorized' | 'failed' };
  status: OrderStatus;
  createdAt: string;
};
```

Money is represented in minor units and formatted only at the display boundary. Dates are stored as ISO calendar dates and delivery windows are named values, not free-form strings.

## 6. Error handling and safety

- Invalid route parameters: not-found UI with a catalog escape hatch.
- Malformed local storage: clear only the invalid key and continue with an empty safe state.
- Stale cart item: display unavailable item and block checkout until removed or replaced.
- Unsupported destination: explain the limitation and provide interest-request action.
- Invalid form: inline field errors, focus first invalid field, preserve all valid input.
- Mock payment failure: keep cart, explain retry, do not create a confirmed order.
- Local repository failure: render retry action and a user-safe message; do not expose stack traces.
- All async state has explicit loading and retry behavior; no indefinite spinners.

## 7. Verification strategy

### Unit tests

- Product filtering and sorting.
- Variant/add-on price calculation.
- Delivery date/city eligibility.
- Cart quantity and line identity behavior.
- Order status transition rules.
- Local-storage parsing fallback.

### Component tests

- Destination selection persists the selected city.
- Catalog filter changes update the URL query state.
- Product customization blocks invalid add-to-cart and accepts valid configuration.
- Cart totals update when quantity or add-ons change.
- Checkout displays field errors and preserves values.

### Route smoke test

Exercise the primary path with local data:

```text
open landing → select city → open shop → open product → customize → add to cart
→ checkout → submit valid form → see order number and confirmed status
```

Also cover empty cart redirect and simulated payment failure.

### Manual visual checks

- 375px mobile, 768px tablet, and 1440px desktop widths.
- Keyboard-only navigation through destination, product, cart, and checkout.
- Focus visibility and form error focus.
- Reduced-motion preference.
- Long product names, Arabic-like text expansion, and no-image fallback.

## 8. Acceptance criteria

- A new user can complete the local mock purchase journey without hidden prerequisites.
- Changing destination visibly affects the catalog/delivery context.
- The theme can be changed by editing token values rather than feature styles.
- No Flowrista-owned logo, exact copy, or image asset is included.
- Catalog filters are URL-addressable and survive refresh.
- Cart survives refresh and protects against stale items.
- Checkout has accessible validation and a deterministic success/failure path.
- The order page clearly distinguishes mock behavior from real fulfillment.
- Tests cover pricing, filtering, delivery eligibility, cart behavior, and the main route flow.

## 9. Future production seams

When the MVP is validated, implement these as separate sub-projects rather than mixing them into the scaffold:

1. Persistent catalog/inventory with city-level availability.
2. Authentication and saved recipients/addresses.
3. Payment gateway and webhook reconciliation.
4. Florist production queue and substitution workflow.
5. Courier dispatch, tracking, and proof of delivery.
6. Transactional email/SMS/WhatsApp notifications.
7. Admin/catalog CMS and operations dashboards.
8. Analytics, experimentation, SEO, and localized content management.

Each future subsystem should keep the same domain vocabulary and replace an adapter, not bypass the feature boundaries.
