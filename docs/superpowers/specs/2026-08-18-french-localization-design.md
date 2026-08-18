# French Localization (AR/EN/FR) — Design

**Date:** 2026-08-18
**Status:** Approved (design review) — ready for implementation plan

## Goal

Add French as a third store language alongside English and Arabic, across every surface: storefront UI, database-stored catalog content, order emails, WhatsApp messages, the chat assistant, and the admin UI.

## Current state

- `Locale = 'en' | 'ar'` (`features/i18n/types.ts`); ~130 UI keys in `features/i18n/dictionaries.ts`; locale persisted in `localStorage` (`rosette.locale.v1`); `dir` switches to `rtl` for Arabic.
- DB content is stored per-language as columns: `products(name_en, name_ar, description_en, description_ar)`, `categories(name_en, name_ar)`, `cities(name_en, name_ar)`, `product_variants(name_en, name_ar)`, and `products.add_ons` as a jsonb array with `name_en`/`name_ar` per element. Consumers pick `locale === 'ar' ? nameAr : name`.
- Emails (`features/notifications/email-templates.ts`), WhatsApp templates (`features/support/whatsapp.ts`), and chat (`features/chat/*`) are bilingual.
- Admin pages (`app/admin/**`) are server components with hardcoded English text; the root layout wraps everything in the client-side `I18nProvider`, but server components cannot read localStorage.

## Design

### 1. Locale foundation

- `Locale = 'en' | 'ar' | 'fr'` in `features/i18n/types.ts`.
- Full French dictionary in `features/i18n/dictionaries.ts` — every `en` key translated; `fr` must be a superset of `en` keys (enforced by a test).
- `I18nProvider` (`features/i18n/I18nProvider.tsx`):
  - Accept `'fr'` when reading `rosette.locale.v1`.
  - Also persist the locale to a `rosette.locale` **cookie** (same value, `path=/`) so server components can read it (see §7).
  - `document.documentElement.lang = locale`; `dir = 'rtl'` only for Arabic.
- `LanguageToggle` (`components/layout/LanguageToggle.tsx`) cycles `en → ar → fr → en`; button label shows the *next* language ("العربية" / "Français" / "English").
- New helper `pickLocalized(locale, { en, ar, fr })` in `features/i18n/pick.ts` — returns `fr` when locale is `fr`, else `ar`, else `en`. Replaces every `locale === 'ar' ? xAr : x` content pick.
- `formatMoney` (currently in `features/cart/CartSummary.tsx`, imported elsewhere): locale → `Intl` tag mapping `ar → ar-EG`, `fr → fr-FR`, `en → en-EG`.

### 2. Database schema + content

New migration `supabase/migrations/003_french_localization.sql`:

- `ALTER TABLE public.products ADD COLUMN name_fr text, ADD COLUMN description_fr text;`
- `ALTER TABLE public.categories ADD COLUMN name_fr text;`
- `ALTER TABLE public.cities ADD COLUMN name_fr text;`
- `ALTER TABLE public.product_variants ADD COLUMN name_fr text;`
- `ALTER TABLE public.order_items ADD COLUMN product_name_fr text;` (snapshot column for French orders)
- Backfill `UPDATE`s with French translations for all 16 seeded products (name + description), 10 cities, categories, and product variants.
- Update each `products.add_ons` jsonb element to include `name_fr` (`jsonb_set` style update or full rewrite of the column values).
- Update `supabase/seed.sql` so fresh setups (`db reset`) include the `_fr` values in the INSERTs.
- Push to the live Supabase project with `supabase db push`; verify with a service-role REST query.

French translations are written by the implementer (product names, descriptions, city names, category names, variant names, add-on names) — idiomatic French, keeping tone consistent with the EN/AR copy.

### 3. Data layer

- `features/commerce/db-types.ts` (`ProductRow`): add `name_fr`, `description_fr` (and `name_fr` on variant/add-on row shapes where selected).
- `features/catalog/types.ts`: `Product` gains optional `nameFr`, `descriptionFr`; `ProductVariant` and `AddOn` gain optional `nameFr`.
- `features/catalog/supabase-repository.ts`: extend `productSelect` with `name_fr, description_fr` (and `name_fr` on `product_variants`).
- `features/catalog/row-mappers.ts`: map `name_fr → nameFr`, `description_fr → descriptionFr`.
- `features/catalog/data.ts` (mock catalog): add `nameFr`/`descriptionFr` to the 16 mock products for parity (tests/dev without Supabase).
- `features/order/supabase-repository.ts`: include `name_fr` in the product read; write `product_name_fr` on `order_items`; read it back in the order detail select.

### 4. Storefront consumers

Switch content picks to `pickLocalized` (or the dictionary) in:

- `features/catalog/ProductCard.tsx` — name, description
- `features/product/ProductDetail.tsx` — name, description
- `features/cart/CartLineItem.tsx` — product name; add-on labels
- `features/destination/DestinationGate.tsx` — city names
- `features/order/OrderPageContent.tsx` — item names (from order snapshot), payment copy
- `app/page.tsx` — city name in the home hero

Move hardcoded en/ar ternaries into the dictionary:

- `features/checkout/CheckoutForm.tsx` — the 4 inline error strings (new keys)
- `features/order/OrderPageContent.tsx` — "Payment confirmed." / "Payment is pending." (new keys)
- `features/chat/ChatWidget.tsx` — widget copy (title/open/close/placeholder/send/fallback, new keys)
- `components/support/WhatsAppButton.tsx` — button label (new key)

### 5. Emails

- `features/notifications/email-types.ts`: `EmailLocale = 'en' | 'ar' | 'fr'`.
- `features/notifications/email-templates.ts`: add `fr` to `subjects`; French title/body/link; `Intl` locale mapping for the total; `dir: ltr`, `lang: fr`.
- `features/order/types.ts`: `CreatePendingOrderInput.locale: 'en' | 'ar' | 'fr'`.
- `features/checkout/types.ts` / order request: locale flows from `useI18n()` at checkout; the order row's `locale` column stores the new value.
- `app/api/webhooks/paymob/route.ts` and the admin status-change route: pass `order.locale` through directly (validated) instead of collapsing to `en`.

### 6. WhatsApp + chat

- `features/support/whatsapp.ts`: `locale: 'en' | 'ar' | 'fr'`; French message template; `getConfiguredWhatsAppHref` updated.
- `features/chat/types.ts`: `ChatResponse.language: 'en' | 'ar' | 'fr'`.
- `features/chat/response-schema.ts`: accept `fr`.
- `features/chat/groq-assistant.ts`: `language` input type; French fallback/order-lookup strings; system prompt passes the selected language.
- `app/api/chat/route.ts`: accept and forward `fr`.
- `ChatWidget.tsx` copy moved to dictionary (§4).

### 7. Admin UI (server components)

- `I18nProvider` writes the `rosette.locale` cookie (§1). `dictionaries.ts` is plain data (no `'use client'`), so server components can import it.
- New `features/i18n/server.ts`: `getServerT()` — async, reads the cookie via `cookies()` (Next 16), returns a `t(key, values?)` bound to the locale dictionary with EN fallback.
- Add admin-specific keys (dashboard, orders/products/inventory/delivery labels, statuses, action buttons) to the shared dictionary in all three locales.
- Localize the 6 admin pages: `app/admin/page.tsx`, `app/admin/orders/page.tsx`, `app/admin/orders/[id]/page.tsx`, `app/admin/products/page.tsx`, `app/admin/inventory/page.tsx`, `app/admin/delivery/page.tsx` — each calls `const t = await getServerT()` and renders through it.

### 8. Testing

- New `tests/domain/i18n-dictionary.test.ts`: every `en` key exists in `ar` and `fr`.
- New `tests/domain/i18n-pick.test.ts`: `pickLocalized` precedence.
- Update `tests/domain/email-templates.test.ts`: fr template (subject/body/link), existing ar assertions intact.
- Update `tests/domain/whatsapp.test.ts`: locale type includes `fr`; fr message asserted.
- Update `tests/domain/catalog-repository.test.ts`: row shape gains `name_fr`/`description_fr`.
- Chat: response-schema accepts `fr` (extend existing chat tests if present).
- Typecheck (`tsc --noEmit`) and full `npm test` must stay green (68/69 with the known env-guard failure).

## Out of scope

- No new language-switcher UI (dropdown/flag menu) — the 3-way cycle keeps the existing compact button.
- No French in the admin sign-in/login flow beyond the dictionary keys it already shares.
- No translation of customer-submitted free text (gift notes, addresses).
- No per-locale URL routing (`/fr/...`) — locale stays a client/server-stored preference, as today.

## Verification

1. `supabase db push` → migration applied; REST query confirms `_fr` values on products/cities/categories/variants/add-ons.
2. Storefront in FR: product cards/detail show French names + descriptions; city gate in French; bag/checkout/order pages in French.
3. Place an FR order → confirmation email arrives in French; order item snapshot stores `product_name_fr`.
4. Chat answers in French when the widget locale is FR.
5. Admin pages render in French when the locale cookie is `fr`.
6. `tsc --noEmit` clean; `npm test` 68/69 (known env-guard failure only).
