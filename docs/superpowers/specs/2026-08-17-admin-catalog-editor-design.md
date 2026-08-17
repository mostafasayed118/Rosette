# Admin catalog & inventory editor — design

Date: 2026-08-17
Status: approved (design sections 1–3)
Scope: second slice of the admin cycle; builds on the order manager slice.

## Goal

Let admins create and edit products (bilingual fields, category/occasion,
price, tone, delivery text, variants, add-ons) and let admins and operators
adjust stock — all through the established pattern: server form pages, a
testable service layer, and thin authorized API routes.

## Non-goals (this slice)

- Delivery-rule editor and dashboard overview (later admin-cycle slices).
- Deleting products or variants from the database. Products are deactivated
  via `active = false`; variants are toggled, never hard-deleted (FK safety:
  `order_items.variant_id` references `product_variants` without cascade).
- Editable slugs: generated once on create, immutable afterward.
- Customer-facing changes (the shop already reads the same tables).

## Decisions locked in brainstorming

- Soft delete: products use the existing `active` flag.
- Inventory: set `quantity` directly; `available = quantity − reserved_quantity`
  and the schema constraint `reserved_quantity <= quantity` are enforced.
- Roles: product/variant/add-on edits are admin-only; stock adjustment is
  allowed for admin and operator.
- UI: dedicated `/admin/products/new` and `/admin/products/[id]` pages with a
  shared client `ProductForm`; `/admin/inventory` gains an inline set-quantity
  control for both roles.
- Variants: add, edit, and toggle `active` only. Add-ons: replace wholesale
  (they are jsonb on the product; no FK). Slug: auto-generate on create.

## Existing infrastructure reused

- `features/admin/authorization.ts` — `AdminIdentity`/`AdminRole`, admin-gated
  reads via `getCurrentAdmin`.
- `features/admin/order-actions.ts` — the fake-client service test pattern and
  `admin_audit_logs` write convention to mirror.
- `app/admin/products/page.tsx`, `app/admin/inventory/page.tsx` — read-only
  lists to extend (edit links; inline stock control).
- `features/catalog/data.ts` — the category and occasion value lists.
- Schema: `products` (incl. `active`), `product_variants` (incl. `active`),
  `inventory (variant_id, quantity, reserved_quantity)`, `admin_audit_logs`.

## Routes, page, and form (approved Section 1)

### Pages (server components, admin-gated)

- `/admin/products/new` — renders `ProductForm` with empty defaults.
- `/admin/products/[id]` — loads `products` + `product_variants(*)` +
  `inventory` rows in one query; not-found → "Product not found" + link back.
- `/admin/products` (existing) — each row links to the edit page.
- `/admin/inventory` (existing) — gains an inline set-quantity control per
  variant (admin and operator).

### `ProductForm` (client component)

- Bilingual: `name_en`, `name_ar`, `description_en`, `description_ar`.
- `category` select over the 5 storefront categories; `occasions`
  multi-select over the 6 storefront occasions; `price` (EGP);
  `tone` hex text validated `#rrggbb`; `delivery` text; `active` toggle.
- Variants editor: rows (`name_en`, `name_ar`, price delta EGP, active
  toggle) plus an "Add variant" action; no delete.
- Add-ons editor: rows (`id`, `name_en`, `name_ar`, price EGP) with
  add/remove; saved as the product `add_ons` jsonb.
- Stock: per-variant `quantity` input with read-only `reserved_quantity` and
  computed `available`; save rejects `quantity < reserved_quantity`.
- Submit → POST (new) or PUT (edit); success → `router.push('/admin/products')`;
  inline errors otherwise.

## Mutation services (approved Section 2)

### `features/admin/catalog-actions.ts`

**`saveProduct(client, admin, input)`** — admin-only. Returns
`'saved' | 'not_found' | 'validation' | 'slug_taken' | 'forbidden' | 'failure'`.

- Create: `slug = slugify(name_en)`; if taken → `'slug_taken'`. Inserts the
  product, its variants, add-ons, and inventory rows.
- Update: upserts product fields; variants upsert by id or insert when new,
  toggle `active`; add-ons replaced wholesale; inventory upserted per variant
  with the reserved-floor guard. Missing product → `'not_found'`.
- Input shape: `{ nameEn, nameAr, descriptionEn?, descriptionAr?, category,
  occasions, priceMinor, tone, delivery, active, variants: [{ id?, nameEn,
  nameAr?, priceDeltaMinor, active }], addOns: [{ id, nameEn, nameAr?,
  priceMinor }], stock: Record<variantId, quantity> }`. Existing variants
  carry their `id`; new ones omit it. `stock` keys are the variant ids.
- Validation (shared): EN/AR names required, category in the 5-value set,
  occasions ⊆ 6-value set, price ≥ 0, tone `/^#[0-9a-f]{6}$/i`, variant
  names non-empty, add-on ids non-empty, `quantity ≥ reserved_quantity`.
- Audit: one `admin_audit_logs` row per save
  (`create_product` / `update_product`).

**`setInventory(client, admin, variantId, quantity)`** — admin **or** operator.
Returns `'updated' | 'forbidden' | 'validation' | 'failure'`. Upserts the
inventory row; rejects `quantity < reserved_quantity`; audits
`update_inventory`.

### Routes (thin shells)

- `POST /api/admin/products` → create
- `PUT /api/admin/products/[id]` → update
- `POST /api/admin/inventory` → set quantity

Each: authorize → parse/validate body → delegate → map result:
403 forbidden, 400 validation, 404 not found, 409 slug_taken, 500 failure,
200/201 success.

## Testing (approved Section 3)

TDD in the isolated worktree, fakes only:

1. `saveProduct` fake-client tests:
   - create inserts product + variants + inventory, writes audit, slug generated
   - slug taken → `'slug_taken'`, no writes
   - update upserts product, upserts existing variant, inserts new variant,
     replaces add-ons, upserts inventory
   - validation rejections (bad tone, empty names, unknown category,
     price < 0, quantity < reserved) → no writes
   - operator → `'forbidden'`, no writes
2. `setInventory` tests: operator allowed, admin allowed, quantity < reserved
   → `'validation'`, audit on success.
3. `slugify` pure tests (lowercase, spaces/diacritics → dashes, Arabic-safe).
4. Full gate before merge: `npm test`, `tsc --noEmit`, `npm run build`,
   `git diff --check`, secret scan.

## Security notes

- All reads behind `getCurrentAdmin`; all writes through the two services via
  thin routes; role checks live in the services, not the client.
- Validation is server-side only; the form's checks are convenience.
- No user input reaches SQL unvalidated (typed schemas + allowlists).
- Audit rows record every product and inventory mutation.

## Deliverables

- `features/admin/catalog-actions.ts` — `saveProduct`, `setInventory`, `slugify`
- `app/api/admin/products/route.ts` — create
- `app/api/admin/products/[id]/route.ts` — update
- `app/api/admin/inventory/route.ts` — set quantity
- `components/admin/ProductForm.tsx` — shared edit/create form
- `app/admin/products/new/page.tsx`, `app/admin/products/[id]/page.tsx`
- `app/admin/products/page.tsx` — add edit links
- `app/admin/inventory/page.tsx` — inline set-quantity control
- Tests: `tests/domain/catalog-actions.test.ts`,
  `tests/domain/slugify.test.ts`
