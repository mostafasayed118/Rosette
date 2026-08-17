# Botanical Gift Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an original, responsive flower-and-gift storefront that demonstrates destination selection, catalog browsing, product customization, cart, mock checkout, and order confirmation using local data.

**Architecture:** Use Next.js App Router with TypeScript. Keep domain logic in focused feature modules and expose local repositories behind interfaces so production data, payments, and delivery services can replace them later. Use URL search parameters for catalog filters and versioned local storage for destination/cart state.

**Tech Stack:** Next.js 16.3.1, React 19, TypeScript, CSS Modules only where local scoping is useful, global CSS custom-property theme tokens, Vitest, Testing Library, and Playwright-compatible route structure without adding a browser dependency to the MVP test command.

**Spec:** `docs/superpowers/specs/2026-08-17-flowrista-inspired-storefront-design.md`

## Global Constraints

- This is an original Flowrista-inspired experience, not a copy of Flowrista's logo, photos, exact copy, or private implementation.
- The MVP uses deterministic local mock data; no real payment, inventory, authentication, courier, notification, or external service integration is added.
- All money values use integer minor units and are formatted only at the display boundary.
- Feature modules do not import another feature's internals.
- Theme values live in semantic CSS custom properties; feature styles do not contain raw palette hex values.
- Customer-facing strings are centralized in feature/page data so later localization is possible.
- No global state library is added; use URL state, versioned local storage, and React component state.
- Every new domain function is introduced by a failing test and verified through a red-green-refactor cycle.
- Do not commit changes unless the user explicitly requests a commit.

---

## File map

### Project and test setup

- Create `package.json`: scripts and pinned Next/React/TypeScript/test dependencies.
- Create `tsconfig.json`: strict TypeScript and Next.js path alias `@/*`.
- Create `next.config.ts`: minimal Next configuration.
- Create `vitest.config.ts`: jsdom environment, Testing Library setup, and `@/*` alias.
- Create `tests/setup.ts`: Testing Library cleanup and browser storage reset.
- Create `tests/test-utils.tsx`: shared render wrapper for client components.

### App shell and visual system

- Create `app/layout.tsx`: metadata, font fallback stack, and root document shell.
- Create `app/globals.css`: approved semantic theme tokens, resets, responsive primitives, focus treatment, and reduced-motion rules.
- Create `app/page.tsx`: destination-aware landing page.
- Create `app/not-found.tsx`: shared not-found state.
- Create `components/layout/SiteHeader.tsx`: brand, destination trigger, cart count, and navigation.
- Create `components/layout/SiteFooter.tsx`: support, delivery, and future-service notes.
- Create `components/ui/Button.tsx`, `components/ui/Field.tsx`, `components/ui/Modal.tsx`, `components/ui/StatusMessage.tsx`, and `components/ui/ProductVisual.tsx`: reusable accessible presentation primitives.

### Domain and data

- Create `features/destination/types.ts`: `Country`, `City`, and `Destination` types.
- Create `features/destination/data.ts`: supported country/city records and delivery windows.
- Create `features/destination/storage.ts`: versioned local-storage read/write/clear helpers.
- Create `features/destination/DestinationGate.tsx`: client destination selector and unsupported-country state.
- Create `features/catalog/types.ts`: `Product`, `ProductVariant`, `AddOn`, `CatalogQuery`, `CatalogPage`, and repository interfaces.
- Create `features/catalog/data.ts`: original sample products, categories, occasions, and visual color metadata.
- Create `features/catalog/repository.ts`: deterministic filtering, sorting, slug lookup, and delivery eligibility.
- Create `features/catalog/catalog-utils.ts`: pure filter/query and price helpers.
- Create `features/catalog/ProductCard.tsx`: product card with delivery promise.
- Create `features/catalog/CatalogToolbar.tsx`: search, filters, sort, and URL query serialization.
- Create `features/catalog/CatalogGrid.tsx`: catalog result, loading, empty, and error presentations.
- Create `features/cart/types.ts`: `CartLine`, `Cart`, and cart input types.
- Create `features/cart/pricing.ts`: pure line and cart total calculations.
- Create `features/cart/storage.ts`: versioned cart persistence.
- Create `features/cart/cart-utils.ts`: add/update/remove/merge operations.
- Create `features/cart/CartProvider.tsx`: client cart context backed by local storage.
- Create `features/cart/CartLineItem.tsx` and `features/cart/CartSummary.tsx`: cart UI.
- Create `features/checkout/types.ts`: recipient, sender, delivery, payment, and form types.
- Create `features/checkout/validation.ts`: pure field validation returning named field errors.
- Create `features/checkout/CheckoutForm.tsx`: accessible client form and submit states.
- Create `features/order/types.ts`: `Order`, `OrderStatus`, and order input/result types.
- Create `features/order/repository.ts`: deterministic order creation/get-by-id in local storage.
- Create `features/order/OrderTimeline.tsx`: status timeline.

### Routes and tests

- Create `app/shop/page.tsx`: catalog route reading `searchParams`.
- Create `app/shop/[slug]/page.tsx`: product route with not-found behavior.
- Create `app/cart/page.tsx`: cart route.
- Create `app/checkout/page.tsx`: checkout route.
- Create `app/orders/[id]/page.tsx`: confirmation route.
- Create `tests/domain/catalog-utils.test.ts`: filter, sort, and query behavior.
- Create `tests/domain/pricing.test.ts`: variants, add-ons, quantity, delivery fee, and totals.
- Create `tests/domain/validation.test.ts`: required/valid form behavior.
- Create `tests/domain/cart-utils.test.ts`: line identity and mutation behavior.
- Create `tests/domain/repository.test.ts`: delivery eligibility and order transitions.
- Create `tests/components/DestinationGate.test.tsx`: selection and persistence.
- Create `tests/components/CheckoutForm.test.tsx`: errors, valid submission, and payment failure.
- Create `tests/routes/purchase-flow.test.tsx`: route-level local-data smoke coverage.

---

## Task 1: Bootstrap the Next.js application and test harness

**Files:** `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `tests/setup.ts`, `tests/test-utils.tsx`

**Interfaces:** Produces a runnable Next.js app, `npm run dev`, `npm run build`, `npm run lint`, and `npm test` scripts. Tests run in jsdom with the `@/*` alias resolving to the repository root.

- [ ] **Step 1: Add the project manifest and scripts.**

```json
{
  "name": "rosette",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^16.3.1",
    "react": "19.1.0",
    "react-dom": "19.1.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.8.0",
    "@testing-library/react": "16.3.0",
    "@testing-library/user-event": "14.6.1",
    "@types/node": "24.3.0",
    "@types/react": "19.1.10",
    "@types/react-dom": "19.1.7",
    "jsdom": "26.1.0",
    "typescript": "5.9.2",
    "vitest": "3.2.4"
  }
}
```

- [ ] **Step 2: Add strict TypeScript and Vitest configuration.** Configure `noUncheckedIndexedAccess`, `noImplicitOverride`, JSX preserve, and `@/*` → `./*`. Configure Vitest with `environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']`, and the same alias.
- [ ] **Step 3: Add the test setup and shared renderer.** Import `@testing-library/jest-dom/vitest`, reset `localStorage` after every test, and export a `renderWithProviders` helper that wraps future `CartProvider` usage.
- [ ] **Step 4: Run the empty harness.** Run `npm install && npm test -- --passWithNoTests`; expect exit code 0 and no test failures.

## Task 2: Create the theme, shell, and destination flow

**Files:** `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/not-found.tsx`, `components/layout/SiteHeader.tsx`, `components/layout/SiteFooter.tsx`, `components/ui/Button.tsx`, `components/ui/Field.tsx`, `components/ui/Modal.tsx`, `components/ui/StatusMessage.tsx`, `components/ui/ProductVisual.tsx`, `features/destination/types.ts`, `features/destination/data.ts`, `features/destination/storage.ts`, `features/destination/DestinationGate.tsx`, `tests/components/DestinationGate.test.tsx`

**Interfaces:** `DestinationGate` emits `onSelected(destination: Destination)`. `readDestination()` returns `Destination | null`; `writeDestination(destination)` persists the versioned record. `ProductVisual` accepts `{ tone: string; label: string; compact?: boolean }` and does not require external image assets.

- [ ] **Step 1: Write the failing destination test.** Assert that selecting `Alexandria` calls the callback with `{ countryCode: 'EG', cityCode: 'alexandria' }` and writes a versioned storage record.
- [ ] **Step 2: Run the test and verify it fails because destination types/storage/gate do not exist.** Run `npm test -- tests/components/DestinationGate.test.tsx`.
- [ ] **Step 3: Implement destination data, safe storage, and the client gate.** Include the public city list observed from the reference plus an “I can’t find my country” state. Ignore malformed storage instead of throwing.
- [ ] **Step 4: Implement the visual system and shell.** Put all approved palette/type/spacing/radius/shadow values in `app/globals.css`; use CSS classes and semantic markup for header, footer, modal, fields, status messages, and original CSS/SVG-like product visuals.
- [ ] **Step 5: Implement the landing page.** Show the destination gate when no destination exists and a destination-aware call-to-action when one exists. Add the original Rosette wordmark and copy, not Flowrista branding.
- [ ] **Step 6: Run the focused test and build.** Run `npm test -- tests/components/DestinationGate.test.tsx` and `npm run build`; both must exit 0.

## Task 3: Add catalog domain logic and catalog route

**Files:** `features/catalog/types.ts`, `features/catalog/data.ts`, `features/catalog/catalog-utils.ts`, `features/catalog/repository.ts`, `features/catalog/ProductCard.tsx`, `features/catalog/CatalogToolbar.tsx`, `features/catalog/CatalogGrid.tsx`, `app/shop/page.tsx`, `tests/domain/catalog-utils.test.ts`

**Interfaces:**

```ts
type CatalogQuery = {
  search?: string;
  category?: string;
  occasion?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'recommended' | 'newest' | 'price-asc' | 'price-desc';
};

function filterProducts(products: Product[], query: CatalogQuery): Product[];
function sortProducts(products: Product[], sort: CatalogQuery['sort']): Product[];
function parseCatalogQuery(params: URLSearchParams): CatalogQuery;
function serializeCatalogQuery(query: CatalogQuery): string;
```

- [ ] **Step 1: Write failing domain tests.** Cover a search for `rose`, category filtering, price ascending, and round-tripping a query through parse/serialize.
- [ ] **Step 2: Run the tests and verify the expected missing-function failures.** Run `npm test -- tests/domain/catalog-utils.test.ts`.
- [ ] **Step 3: Implement typed original catalog data and pure catalog utilities.** Use at least eight products across hand bouquets, vase arrangements, plants, and gift add-ons; represent all money in minor units.
- [ ] **Step 4: Implement the repository.** `list(query)` applies filtering/sorting; `getBySlug(slug)` returns `Product | null`; `isDeliverable({ cityCode, date })` returns a deterministic eligibility result with reason text.
- [ ] **Step 5: Build catalog components and `/shop`.** Read `searchParams`, render the destination context, toolbar, product grid, empty state, and delivery promise. Keep URL state as the source of truth for filters.
- [ ] **Step 6: Run focused tests and a production build.** Run `npm test -- tests/domain/catalog-utils.test.ts` and `npm run build`.

## Task 4: Add product detail, cart state, and pricing

**Files:** `features/cart/types.ts`, `features/cart/pricing.ts`, `features/cart/storage.ts`, `features/cart/cart-utils.ts`, `features/cart/CartProvider.tsx`, `features/cart/CartLineItem.tsx`, `features/cart/CartSummary.tsx`, `features/catalog/ProductCard.tsx`, `app/shop/[slug]/page.tsx`, `app/cart/page.tsx`, `tests/domain/pricing.test.ts`, `tests/domain/cart-utils.test.ts`

**Interfaces:**

```ts
function calculateLineTotal(line: CartLine): number;
function calculateCartTotals(lines: CartLine[], deliveryFee: number): OrderTotals;
function addLine(cart: Cart, input: AddCartLineInput): Cart;
function updateLineQuantity(cart: Cart, lineId: string, quantity: number): Cart;
function removeLine(cart: Cart, lineId: string): Cart;
```

- [ ] **Step 1: Write failing pricing and cart tests.** Assert variant delta, add-on cost, quantity multiplication, delivery fee, distinct customization line identity, quantity clamping, and removal.
- [ ] **Step 2: Run focused tests and verify they fail for missing domain functions.** Run `npm test -- tests/domain/pricing.test.ts tests/domain/cart-utils.test.ts`.
- [ ] **Step 3: Implement pure pricing/cart functions and versioned persistence.** Reject non-positive quantity, preserve product snapshots in cart lines, and return safe empty state for malformed storage.
- [ ] **Step 4: Implement `CartProvider`.** Expose `{ cart, itemCount, totals, addItem, updateQuantity, removeItem, clearCart }`; hydrate only on the client and avoid rendering a hydration-dependent count until ready.
- [ ] **Step 5: Implement product customization and cart routes.** Require a variant where the product offers variants, validate delivery eligibility, show an accessible add-to-cart confirmation, and provide edit/remove controls.
- [ ] **Step 6: Run focused tests, then build.** Run the two domain test files and `npm run build`.

## Task 5: Add checkout validation and local order workflow

**Files:** `features/checkout/types.ts`, `features/checkout/validation.ts`, `features/checkout/CheckoutForm.tsx`, `features/order/types.ts`, `features/order/repository.ts`, `features/order/OrderTimeline.tsx`, `app/checkout/page.tsx`, `app/orders/[id]/page.tsx`, `tests/domain/validation.test.ts`, `tests/domain/repository.test.ts`, `tests/components/CheckoutForm.test.tsx`

**Interfaces:**

```ts
function validateCheckout(input: CheckoutInput): CheckoutErrors;
function createLocalOrder(input: CreateOrderInput): Result<Order, OrderError>;
function getLocalOrder(id: string): Order | null;
function getStatusSteps(status: OrderStatus): Array<{ status: OrderStatus; complete: boolean }>;
```

- [ ] **Step 1: Write failing validation tests.** Assert blank recipient/address/email/date fields produce named errors and a complete valid input returns `{}`.
- [ ] **Step 2: Write failing repository tests.** Assert a valid order is created as `confirmed` after the simulated authorization path and a payment failure returns an error without storing an order.
- [ ] **Step 3: Run both test groups and verify missing-function failures.** Run `npm test -- tests/domain/validation.test.ts tests/domain/repository.test.ts`.
- [ ] **Step 4: Implement validation and deterministic local order repository.** Use stable IDs from a timestamp plus counter, preserve the cart snapshot, store only successful orders, and expose explicit `failed`/`confirmed` results.
- [ ] **Step 5: Implement the checkout form and route.** Redirect empty carts to `/cart`; on invalid submission focus the first invalid field; on simulated payment failure retain the cart and show a retry message; on success clear the cart and route to `/orders/[id]`.
- [ ] **Step 6: Implement order confirmation/timeline.** Show display number, items, destination, totals, delivery promise, mock-order disclosure, and status steps.
- [ ] **Step 7: Run focused tests and build.** Run all validation/repository/component tests and `npm run build`.

## Task 6: Integrate the app shell and route-level smoke coverage

**Files:** `app/layout.tsx`, `app/shop/page.tsx`, `app/shop/[slug]/page.tsx`, `app/cart/page.tsx`, `app/checkout/page.tsx`, `app/orders/[id]/page.tsx`, `tests/routes/purchase-flow.test.tsx`, `README.md`

**Interfaces:** The complete local purchase path must be callable through rendered routes without a vendor service or environment variable. Shared layout wraps all routes with `CartProvider` and `SiteHeader`.

- [ ] **Step 1: Write the failing route smoke test.** Render the route-level flow with a selected city, select a known product, add a valid configuration, submit valid checkout fields, and assert a display order number and `confirmed` status.
- [ ] **Step 2: Run the smoke test and verify it fails at the first missing route integration.** Run `npm test -- tests/routes/purchase-flow.test.tsx`.
- [ ] **Step 3: Integrate the provider, header cart count, route links, loading/error/empty states, and not-found handling.** Ensure destination changes are visible in the header and catalog context.
- [ ] **Step 4: Add the README.** Document local setup, scripts, route map, design-token location, mock behavior, and the explicit boundary between demo behavior and production integrations.
- [ ] **Step 5: Run all tests, lint, and production build.** Run `npm test`, `npm run lint`, and `npm run build`; inspect each exit code and failure count.
- [ ] **Step 6: Perform the manual acceptance checklist.** Check 375px, 768px, and 1440px layouts; keyboard navigation; focus-visible styles; reduced motion; long text; malformed local storage; empty cart; stale cart; unsupported destination; and simulated payment failure.

## Plan self-review

- **Spec coverage:** destination gate is covered by Task 2; visual tokens and responsive shell by Task 2; catalog and URL filters by Task 3; product/customization/cart/pricing by Task 4; checkout/order lifecycle/errors by Task 5; integration, README, and acceptance checks by Task 6.
- **Completeness scan:** implementation steps contain concrete files, interfaces, commands, and expected verification outcomes.
- **Type consistency:** `Destination`, `Product`, `CartLine`, `Order`, `CheckoutInput`, `OrderTotals`, and `OrderStatus` are introduced before consumers. Repository signatures and cart provider methods are named consistently across tasks.
- **Scope:** this is one storefront subsystem using local adapters. Production integrations remain separate follow-up plans as required by the specification.
- **Verification:** every domain behavior begins with a failing test, then focused test execution, implementation, and a broader build/test check.
