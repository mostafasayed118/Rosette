# Rosette

Rosette is an original botanical gift storefront concept inspired by the public customer journey of flower-delivery sites. It demonstrates destination selection, a localized mock catalog, product customization, cart review, checkout validation, and order confirmation without copying Flowrista branding, assets, copy, or private implementation.

## Local setup

```bash
npm install
npm run dev
```

Verification scripts:

```bash
npm test
npm run lint
npm run build
```

## Routes

- `/` — destination-aware landing page and city selector.
- `/shop` — URL-filtered catalog.
- `/shop/[slug]` — product detail, variants, add-ons, gift note, delivery date.
- `/cart` — local cart review and pricing.
- `/checkout` — validated mock checkout.
- `/orders/[id]` — local confirmation and status timeline.

## Theme

The visual system is saved in `app/globals.css` as semantic CSS variables. Change the palette, type, spacing, radii, and shadow values there to reskin the experience without editing feature components. The direction is botanical editorial: warm ivory, deep green, terracotta warmth, restrained borders, and original CSS-based botanical visuals.

## Languages and RTL

The header language toggle switches between English and Arabic. The choice is stored in `rosette.locale.v1`; Arabic sets the document language to `ar`, switches the document direction to `rtl`, uses Arabic city/product metadata, and mirrors the layout through logical CSS and RTL-specific alignment rules. Translations live in `features/i18n/dictionaries.ts` and the provider is `features/i18n/I18nProvider.tsx`.

All customer-facing route chrome, destination selection, catalog controls, product customization, cart, checkout, and order status copy use the dictionary. Product data carries `nameAr` and `descriptionAr` fields for localized catalog content.

## Mock boundary

The MVP uses deterministic local data and versioned browser storage:

- `rosette.destination.v1` stores the chosen country/city.
- `rosette.cart.v1` stores cart lines.
- `rosette.orders.v1` stores successful demo orders.

No payment is captured, no inventory is reserved, and no delivery request is sent. The adapter seams in `features/catalog/repository.ts` and `features/order/repository.ts` are the replacement points for a real database, payment gateway, inventory service, courier service, and notifications in later work.
