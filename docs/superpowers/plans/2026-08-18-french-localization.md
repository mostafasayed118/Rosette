# French Localization (AR/EN/FR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add French as a third store language (with English and Arabic) across the storefront UI, DB-stored catalog content, order emails, WhatsApp messages, the chat assistant, and the admin UI.

**Architecture:** Extend the existing client-side `I18nProvider` dictionary from two locales to three, add `_fr` columns to the commerce tables (backfilled by a new migration), thread the `Locale` type through the data layer, email, chat, and WhatsApp, and give server-rendered admin pages a cookie-based `getServerT()` so they can read the same dictionary.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React, TypeScript, Supabase (Postgres + REST), Vitest, Groq SDK, nodemailer.

**Spec:** `docs/superpowers/specs/2026-08-18-french-localization-design.md`

## Global Constraints

- `Locale = 'en' | 'ar' | 'fr'` everywhere a locale is typed.
- The `fr` dictionary must contain every key the `en` dictionary has (test-enforced).
- Money stays in integer minor units (piasters); only formatting changes per locale: `en → en-EG`, `ar → ar-EG`, `fr → fr-FR`.
- `dir` is `rtl` only for Arabic; `fr` and `en` are `ltr`.
- Locale is persisted in localStorage (`rosette.locale.v1`) **and** a `rosette.locale` cookie (`path=/`, `max-age=31536000`, `samesite=lax`) so server components can read it.
- No new dependencies. Follow existing file/export patterns.
- Every task ends with `npx tsc --noEmit` and the relevant `npx vitest run` green; the full suite must stay at 68 passing + 1 known env-guard failure (plus the new tests added here).
- The live Supabase project must receive the new migration (`supabase db push`).

---

### Task 1: Locale Foundation

**Files:**
- Modify: `features/i18n/types.ts`
- Modify: `features/i18n/dictionaries.ts`
- Create: `features/i18n/pick.ts`
- Modify: `features/i18n/I18nProvider.tsx`
- Modify: `components/layout/LanguageToggle.tsx`
- Create: `features/money.ts`
- Modify: `features/cart/CartSummary.tsx` (re-export `formatMoney` from `features/money.ts`, keep its behavior)
- Create: `tests/domain/i18n-dictionary.test.ts`
- Create: `tests/domain/i18n-pick.test.ts`

**Interfaces:**
- Produces: `type Locale = 'en' | 'ar' | 'fr'`; `messages: Record<Locale, Record<string, string>>`; `pickLocalized(locale: Locale, values: { en: string; ar?: string; fr?: string }): string`; `formatMoney(minorUnits: number, locale: Locale = 'en'): string`; `useI18n()` unchanged shape but `locale` may now be `'fr'`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/i18n-dictionary.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { messages } from '@/features/i18n/dictionaries';

describe('i18n dictionaries', () => {
  it('keeps every locale a superset of the English keys', () => {
    const enKeys = Object.keys(messages.en).sort();
    for (const locale of ['ar', 'fr'] as const) {
      const keys = Object.keys(messages[locale]).sort();
      expect(keys).toEqual(expect.arrayContaining(enKeys));
    }
  });
});
```

`tests/domain/i18n-pick.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { pickLocalized } from '@/features/i18n/pick';

describe('pickLocalized', () => {
  const values = { en: 'Rose', ar: 'ورد', fr: 'Rose' };
  it('prefers the active locale and falls back to English', () => {
    expect(pickLocalized('en', values)).toBe('Rose');
    expect(pickLocalized('ar', values)).toBe('ورد');
    expect(pickLocalized('fr', values)).toBe('Rose');
  });
  it('falls back to English when the active locale has no value', () => {
    expect(pickLocalized('fr', { en: 'Rose', ar: 'ورد' })).toBe('Rose');
    expect(pickLocalized('ar', { en: 'Rose' })).toBe('Rose');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/i18n-dictionary.test.ts tests/domain/i18n-pick.test.ts`
Expected: FAIL — `pick.ts` does not exist; `Locale` has no `'fr'`; `messages.fr` undefined.

- [ ] **Step 3: Update `features/i18n/types.ts`**

```ts
export type Locale = 'en' | 'ar' | 'fr';
```

- [ ] **Step 4: Create `features/i18n/pick.ts`**

```ts
import type { Locale } from './types';

export function pickLocalized(locale: Locale, values: { en: string; ar?: string; fr?: string }): string {
  if (locale === 'ar' && values.ar) return values.ar;
  if (locale === 'fr' && values.fr) return values.fr;
  return values.en;
}
```

- [ ] **Step 5: Add the full French dictionary + new shared keys to `features/i18n/dictionaries.ts`**

Add `'fr'` to the `Record<Locale, ...>` and append the `fr` object. The `language` key is the name of the **next** language in the toggle cycle (en→ar→fr→en), so `fr.language = 'English'`. Full `fr` object:

```ts
fr: {
  shop: 'Parcourir la collection', chooseDestination: 'Choisir la destination', deliveringTo: 'Livraison à {city}', bag: 'Panier', language: 'English', brandTagline: 'Des fleurs réfléchies, inoubliables en toute discrétion.', footerDelivery: 'Soin de la livraison', footerNotes: 'Messages cadeaux', footerDemo: 'Boutique de démonstration', homeEyebrow: 'La sélection Rosette · fraîche du moment', homeTitle: 'Des fleurs qui disent les choses avant vous.', homeLede: 'Des fleurs de saison, nouées à la main avec retenue et beaucoup de sentiment. Créées pour les moments qui méritent plus qu’un message.', explore: 'Explorer la collection', editorialEyebrow: 'Pour le geste', editorialTitle: 'Choisissez un sentiment, laissez-nous le reste.', destinationEyebrow: 'Un peu de joie, livrée', destinationTitle: 'Choisissez où ira ce sentiment.', destinationLede: 'Indiquez-nous d’abord la destination. Nous vous montrerons des fleurs et des promesses de livraison faites pour votre ville.', country: 'Pays', deliveryCity: 'Ville de livraison', selectCity: 'Choisir une ville', continue: 'Continuer vers la collection', unsupported: 'Vous ne trouvez pas votre pays ? Demandez-nous d’y commencer.', requestSaved: 'Nous garderons votre demande à l’esprit pendant que Rosette s’étend au-delà de l’Égypte.', collectionEyebrow: 'La collection · {count} gestes', collectionTitle: 'Un geste pour chaque sentiment.', collectionLede: 'Des fleurs de saison et de petites attentions, choisies pour arriver avec la bonne dose de surprise.', changeDestination: 'Changer de destination', search: 'Rechercher', searchPlaceholder: 'Trouver un sentiment', category: 'Catégorie', occasion: 'Occasion', sort: 'Trier', all: 'Tout', recommended: 'Recommandé', newest: 'Nouveautés', priceAsc: 'Prix : croissant', priceDesc: 'Prix : décroissant', emptyTitle: 'Rien dans cette humeur précise pour l’instant.', emptyHint: 'Essayez un autre filtre ou', resetCollection: 'réinitialiser la collection', emptyReset: 'réinitialiser la collection', from: 'À partir de', sameDay: 'Livraison le jour même', nextDay: 'Livraison le lendemain', backCollection: 'Retour à la collection', chooseSize: 'Choisir une taille', extraThoughtful: 'Ajoutez une attention particulière', giftNote: 'Message cadeau', optional: 'facultatif', notePlaceholder: 'Quelques mots de votre part', deliveryDate: 'Date de livraison', addToBag: 'Ajouter au panier', added: 'Ajouté avec soin.', reviewBag: 'Voir mon panier', bagEyebrow: 'Votre sélection', bagTitle: 'Le panier, pour l’instant.', bagLede: 'Vérifiez les détails avant que votre geste ne commence son voyage.', openingBag: 'Ouverture du panier…', bagWaiting: 'Votre panier attend un sentiment.', browseCollection: 'Parcourir la collection', remove: 'Retirer', quantity: 'Quantité', noAddOns: 'Aucune option', checkout: 'Continuer vers le paiement', demoCheckout: 'Paiement de démonstration · aucun montant n’est débité.', subtotal: 'Sous-total', delivery: 'Livraison', total: 'Total', checkoutEyebrow: 'Le dernier détail', checkoutTitle: 'Envoyez quelque chose de beau.', checkoutLede: 'Quelques détails et le geste peut commencer.', whoFor: 'Pour qui ?', recipientName: 'Nom du destinataire', recipientPhone: 'Téléphone du destinataire', address: 'Adresse de livraison', details: 'Les détails', yourName: 'Votre nom', yourEmail: 'Votre e-mail', deliveryWindow: 'Créneau de livraison', paymentEyebrow: 'Paiement, en douceur', paymentMethod: 'Moyen de paiement', demoCard: 'Carte de démonstration', payDelivery: 'Paiement à la livraison', simulateFailure: 'Simuler un échec de paiement', placeOrder: 'Passer la commande', demoDisclosure: 'Ceci est une démonstration locale. Aucun paiement ni aucune demande de livraison n’est envoyé.', orderMissing: 'Nous n’avons pas trouvé cette commande.', startAgain: 'Recommencer', orderEyebrow: 'Commande {number}', orderTitle: 'En route pour devenir un souvenir.', orderLede: 'Une confirmation pour {recipient}, livrée à {address}.', keepBrowsing: 'Continuer à explorer', yourOrder: 'Votre commande', demoOrder: 'Commande de démonstration · aucun paiement n’a été débité.', orderConfirmed: 'Commande confirmée', preparing: 'En préparation', outForDelivery: 'En cours de livraison', delivered: 'Livrée', searchCategory: 'Rechercher une catégorie', celebration: 'Célébration', love: 'Amour', thankYou: 'Merci', newHome: 'Nouveau chez-soi', congratulations: 'Félicitations', handBouquet: 'Bouquet main', vaseArrangement: 'Arrangement en vase', plants: 'Plantes', giftBoxes: 'Coffrets cadeaux', sympathy: 'Condoléances', signature: 'Signature', classic: 'Classique', generous: 'Généreux', singleVase: 'Vase simple', doubleVase: 'Vase double', small: 'Petit', large: 'Grand', handwrittenNote: 'Carte manuscrite', darkChocolate: 'Chocolat noir', balloon: 'Ballon de fête', paymob: 'Payer en toute sécurité avec Paymob', processing: 'Traitement…', signIn: 'Se connecter', signOut: 'Se déconnecter', email: 'E-mail', password: 'Mot de passe', signInFailed: 'E-mail ou mot de passe invalide.', authNotConfigured: 'Supabase n’est pas configuré. Ajoutez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY à .env.local (voir docs/setup/runbook.md).',
  // New keys added in Task 4–7 (add to en and ar too, see below)
  orderCreateFailed: 'Nous n’avons pas pu créer la commande.', onlinePaymentNotConfigured: 'Le paiement en ligne n’est pas encore configuré. Choisissez le paiement à la livraison ou ajoutez les réglages Paymob.', demoPaymentFailed: 'Le paiement de démonstration n’a pas abouti. Votre panier est conservé ; réessayez.', temporaryError: 'Une erreur temporaire est survenue. Veuillez réessayer.', paymentConfirmed: 'Paiement confirmé.', paymentPending: 'Paiement en attente.', chatTitle: 'Assistant Rosette', chatOpen: 'Ouvrir l’assistant', chatClose: 'Fermer l’assistant', chatPlaceholder: 'Posez une question sur les fleurs ou la livraison', chatSend: 'Envoyer', chatFallback: 'Notre équipe peut vous aider sur WhatsApp.', talkToTeam: 'Parler à notre équipe', whatsappChat: 'Discuter sur WhatsApp',
  adminEyebrow: 'Opérations Rosette', adminDashboard: 'Tableau de bord admin', signedInAs: 'Connecté en tant que {role}.', orders: 'Commandes', products: 'Produits', inventory: 'Stock', deliveryRules: 'Règles de livraison', customerOrders: 'Commandes clients', noOrdersMatch: 'Aucune commande ne correspond.', orderNotFound: 'Commande introuvable', backToOrders: 'Retour aux commandes', recipientAndDelivery: 'Destinataire et livraison', items: 'Articles', payment: 'Paiement', timeline: 'Chronologie', updateStatus: 'Mettre à jour le statut', contactOnWhatsApp: 'Contacter sur WhatsApp', adminSearch: 'Rechercher', adminSearchPlaceholder: 'Numéro de commande, e-mail ou téléphone', paymentFilter: 'Paiement', fulfillmentFilter: 'Exécution', filter: 'Filtrer', statusConfirmed: 'Confirmée', statusPreparing: 'En préparation', statusReadyForDelivery: 'Prête pour la livraison', statusOutForDelivery: 'En cours de livraison', statusDelivered: 'Livrée', statusCancelled: 'Annulée', updating: 'Mise à jour…', couldNotUpdateOrder: 'Impossible de mettre à jour la commande. Actualisez et réessayez.', catalogOperations: 'Opérations catalogue', stockOperations: 'Opérations de stock', deliveryOperations: 'Opérations de livraison', available: 'disponible', reserved: 'réservé', active: 'Actif', inactive: 'Inactif',
}
```

Also add the same new keys to the `en` and `ar` objects (append before the closing brace of each):

```ts
// en additions:
orderCreateFailed: 'We could not create the order.', onlinePaymentNotConfigured: 'Online payment is not configured yet. Choose pay on delivery or add Paymob settings.', demoPaymentFailed: 'The demo payment did not go through. Your bag is safe; try again.', temporaryError: 'A temporary error occurred. Please try again.', paymentConfirmed: 'Payment confirmed.', paymentPending: 'Payment is pending.', chatTitle: 'Rosette assistant', chatOpen: 'Open assistant', chatClose: 'Close assistant', chatPlaceholder: 'Ask about flowers or delivery', chatSend: 'Send', chatFallback: 'Our team can help you on WhatsApp.', talkToTeam: 'Talk to our team', whatsappChat: 'Chat on WhatsApp',
adminEyebrow: 'Rosette operations', adminDashboard: 'Admin dashboard', signedInAs: 'Signed in as {role}.', orders: 'Orders', products: 'Products', inventory: 'Inventory', deliveryRules: 'Delivery rules', customerOrders: 'Customer orders', noOrdersMatch: 'No orders match.', orderNotFound: 'Order not found', backToOrders: 'Back to orders', recipientAndDelivery: 'Recipient & delivery', items: 'Items', payment: 'Payment', timeline: 'Timeline', updateStatus: 'Update status', contactOnWhatsApp: 'Contact on WhatsApp', adminSearch: 'Search', adminSearchPlaceholder: 'Order number, email, or phone', paymentFilter: 'Payment', fulfillmentFilter: 'Fulfillment', filter: 'Filter', statusConfirmed: 'Confirmed', statusPreparing: 'Preparing', statusReadyForDelivery: 'Ready for delivery', statusOutForDelivery: 'Out for delivery', statusDelivered: 'Delivered', statusCancelled: 'Cancelled', updating: 'Updating…', couldNotUpdateOrder: 'Could not update the order. Refresh and try again.', catalogOperations: 'Catalog operations', stockOperations: 'Stock operations', deliveryOperations: 'Delivery operations', available: 'available', reserved: 'reserved', active: 'Active', inactive: 'Inactive',
```

```ts
// ar additions:
orderCreateFailed: 'تعذر إنشاء الطلب.', onlinePaymentNotConfigured: 'الدفع الإلكتروني غير مفعّل بعد. اختر الدفع عند التوصيل أو أضف إعدادات Paymob.', demoPaymentFailed: 'لم تتم عملية الدفع التجريبية. سلتك محفوظة، حاول مرة أخرى.', temporaryError: 'حدث خطأ مؤقت. حاول مرة أخرى.', paymentConfirmed: 'تم تأكيد الدفع.', paymentPending: 'الدفع قيد الانتظار.', chatTitle: 'مساعد روزيت', chatOpen: 'افتح المساعد', chatClose: 'أغلق المساعد', chatPlaceholder: 'اسأل عن الزهور أو التوصيل', chatSend: 'إرسال', chatFallback: 'يمكن لفريقنا مساعدتك عبر واتساب.', talkToTeam: 'تحدث مع فريقنا', whatsappChat: 'تواصل عبر واتساب',
adminEyebrow: 'عمليات روزيت', adminDashboard: 'لوحة التحكم', signedInAs: 'مسجّل الدخول كـ {role}.', orders: 'الطلبات', products: 'المنتجات', inventory: 'المخزون', deliveryRules: 'قواعد التوصيل', customerOrders: 'طلبات العملاء', noOrdersMatch: 'لا توجد طلبات مطابقة.', orderNotFound: 'الطلب غير موجود', backToOrders: 'العودة إلى الطلبات', recipientAndDelivery: 'المستلم والتوصيل', items: 'العناصر', payment: 'الدفع', timeline: 'الخط الزمني', updateStatus: 'تحديث الحالة', contactOnWhatsApp: 'تواصل عبر واتساب', adminSearch: 'بحث', adminSearchPlaceholder: 'رقم الطلب أو البريد أو الهاتف', paymentFilter: 'الدفع', fulfillmentFilter: 'التنفيذ', filter: 'تصفية', statusConfirmed: 'مؤكد', statusPreparing: 'قيد التجهيز', statusReadyForDelivery: 'جاهز للتوصيل', statusOutForDelivery: 'خرجت للتوصيل', statusDelivered: 'تم التوصيل', statusCancelled: 'ملغى', updating: 'جارٍ التحديث…', couldNotUpdateOrder: 'تعذر تحديث الطلب. حدّث الصفحة وحاول مرة أخرى.', catalogOperations: 'عمليات الكتالوج', stockOperations: 'عمليات المخزون', deliveryOperations: 'عمليات التوصيل', available: 'متاح', reserved: 'محجوز', active: 'نشط', inactive: 'غير نشط',
```

- [ ] **Step 6: Update `features/i18n/I18nProvider.tsx`** — accept `'fr'` and write the cookie

Replace the storage-read line and the `dir` effect, and add the cookie write inside `setLocale`:

```tsx
useEffect(() => { const saved = window.localStorage.getItem(STORAGE_KEY); if (saved === 'ar' || saved === 'en' || saved === 'fr') setLocaleState(saved); }, []);
useEffect(() => { document.documentElement.lang = locale; document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'; }, [locale]);
```
and in `setLocale`:
```tsx
const setLocale = (next: Locale) => {
  setLocaleState(next);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, next);
    document.cookie = `rosette.locale=${next}; path=/; max-age=31536000; samesite=lax`;
  }
};
```

- [ ] **Step 7: Update `components/layout/LanguageToggle.tsx`** — 3-way cycle

```tsx
'use client';
import { useI18n } from '@/features/i18n/I18nProvider';
import type { Locale } from '@/features/i18n/types';

const cycle: Locale[] = ['en', 'ar', 'fr'];

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const next = cycle[(cycle.indexOf(locale) + 1) % cycle.length];
  return <button className="language-toggle" type="button" onClick={() => setLocale(next)} aria-label={t('language')}>{t('language')}</button>;
}
```

- [ ] **Step 8: Create `features/money.ts` and re-export from `CartSummary.tsx`**

`features/money.ts`:
```ts
import type { Locale } from '@/features/i18n/types';

const intlLocales: Record<Locale, string> = { en: 'en-EG', ar: 'ar-EG', fr: 'fr-FR' };

export function formatMoney(minorUnits: number, locale: Locale = 'en') {
  return new Intl.NumberFormat(intlLocales[locale], { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(minorUnits / 100);
}
```

In `features/cart/CartSummary.tsx`, delete the local `formatMoney` definition and add `export { formatMoney } from '@/features/money';` (keep the component using it). Run `npx tsc --noEmit`; fix any imports that referenced the old local definition (they keep working via the re-export).

- [ ] **Step 9: Run the tests and typecheck**

Run: `npx vitest run tests/domain/i18n-dictionary.test.ts tests/domain/i18n-pick.test.ts && npx tsc --noEmit`
Expected: both new tests PASS, typecheck clean.

- [ ] **Step 10: Commit**

```bash
git add features/i18n features/money.ts features/cart/CartSummary.tsx components/layout/LanguageToggle.tsx tests/domain/i18n-dictionary.test.ts tests/domain/i18n-pick.test.ts
git commit -m "feat: add French locale foundation (types, dictionary, pick helper, cookie)"
```

---

### Task 2: Database Schema + French Content

**Files:**
- Create: `supabase/migrations/003_french_localization.sql`
- Modify: `supabase/seed.sql`
- (Live DB) Run `supabase db push` and verify via REST.

**Interfaces:**
- Produces: `products.name_fr`, `products.description_fr`, `categories.name_fr`, `cities.name_fr`, `product_variants.name_fr`, `order_items.product_name_fr` (all `text`, nullable); every seeded row backfilled with French.

- [ ] **Step 1: Write the migration `supabase/migrations/003_french_localization.sql`**

```sql
-- French localization: add _fr columns and backfill seeded content.

alter table public.products add column if not exists name_fr text;
alter table public.products add column if not exists description_fr text;
alter table public.categories add column if not exists name_fr text;
alter table public.cities add column if not exists name_fr text;
alter table public.product_variants add column if not exists name_fr text;
alter table public.order_items add column if not exists product_name_fr text;

update public.categories set name_fr = 'Bouquets main' where slug = 'hand-bouquet';
update public.categories set name_fr = 'Arrangements en vase' where slug = 'vase-arrangement';
update public.categories set name_fr = 'Plantes' where slug = 'plants';
update public.categories set name_fr = 'Coffrets cadeaux' where slug = 'gift-boxes';
update public.categories set name_fr = 'Condoléances' where slug = 'sympathy';

update public.cities set name_fr = 'Le Grand Caire' where code = 'greater-cairo';
update public.cities set name_fr = 'Alexandrie' where code = 'alexandria';
update public.cities set name_fr = 'Mansourah' where code = 'mansoura';
update public.cities set name_fr = 'Zagazig' where code = 'zagazig';
update public.cities set name_fr = 'Tanta' where code = 'tanta';
update public.cities set name_fr = 'Menoufia' where code = 'menofya';
update public.cities set name_fr = 'Côte Nord' where code = 'north-coast';
update public.cities set name_fr = 'Aïn Sokhna' where code = 'ain-sokhna';
update public.cities set name_fr = 'Ismaïlia' where code = 'ismailia';
update public.cities set name_fr = 'Benha' where code = 'banha';
update public.cities set name_fr = 'Suez' where code = 'suez';

update public.product_variants set name_fr = 'Classique' where name_en = 'Classic';
update public.product_variants set name_fr = 'Généreux' where name_en = 'Generous';
update public.product_variants set name_fr = 'Vase simple' where name_en = 'Single';
update public.product_variants set name_fr = 'Vase double' where name_en = 'Double';
update public.product_variants set name_fr = 'Petit' where name_en = 'Small';
update public.product_variants set name_fr = 'Grand' where name_en = 'Large';

update public.products set name_fr = 'L’Heure des Roses', description_fr = 'Des roses de jardin douces en bouquet noué main, emballées comme le mérite un message discret.' where slug = 'rose-hour';
update public.products set name_fr = 'Matin Vert', description_fr = 'Un arrangement feuillu en vase, avec le calme d’une fenêtre laissée ouverte.' where slug = 'green-morning';
update public.products set name_fr = 'Tiges Ensoleillées', description_fr = 'Des tiges dorées pleines de mouvement, cueillies pour une journée lumineuse.' where slug = 'sunlit-stems';
update public.products set name_fr = 'Amour Terracotta', description_fr = 'Des renoncules chaleureuses dans un emballage sculptural — un geste venu du cœur.' where slug = 'terracotta-love';
update public.products set name_fr = 'Orchidée Sereine', description_fr = 'Une orchidée élégante qui garde le sentiment vivant pendant des mois.' where slug = 'quiet-orchid';
update public.products set name_fr = 'Prairie Sauvage', description_fr = 'Des couleurs de saison libres, comme cueillies lors d’une promenade matinale.' where slug = 'wild-meadow';
update public.products set name_fr = 'Petit Merci', description_fr = 'Un petit bouquet pour ceux qui illuminent nos journées.' where slug = 'little-thanks';
update public.products set name_fr = 'Nuage d’Agrumes', description_fr = 'Un arrangement léger et parfumé, avec une touche d’agrumes.' where slug = 'citrus-cloud';
update public.products set name_fr = 'Roses de Minuit', description_fr = 'Des roses rouge vin profond sur de longues tiges — dramatiques et inoubliables.' where slug = 'midnight-roses';
update public.products set name_fr = 'Souffle de Sakura', description_fr = 'De pâles fleurs roses arrangées comme une brise de printemps dans un vase.' where slug = 'sakura-breath';
update public.products set name_fr = 'Lotus Blanc', description_fr = 'Un arrangement de lotus blanc apaisant — la sérénité pour un nouveau départ.' where slug = 'white-lotus';
update public.products set name_fr = 'Coffret de Pétales', description_fr = 'Un coffret soigné de pétales et de fleurs détachées — la façon moderne de le dire.' where slug = 'petal-box';
update public.products set name_fr = 'Roses en Coffret', description_fr = 'Une douzaine de roses à longues tiges dans un coffret souvenir, livrées à votre porte.' where slug = 'roses-in-a-box';
update public.products set name_fr = 'Sérénade Blanche', description_fr = 'Un arrangement discret de fleurs blanches pour un moment de respect.' where slug = 'white-serenade';
update public.products set name_fr = 'Souvenir Discret', description_fr = 'Une plante verte apaisante qui fait grandir un souvenir.' where slug = 'quiet-remembrance';
update public.products set name_fr = 'Roses Grandioses', description_fr = 'Une brassée généreuse de roses à longues tiges, nouée main, sans retenue.' where slug = 'grand-roses';

-- add_ons jsonb: add name_fr to each element (full rewrite, values match seed.sql)
update public.products set add_ons = '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500},{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","name_fr":"Chocolat noir","price_minor":1800}]'::jsonb where slug = 'rose-hour';
update public.products set add_ons = '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500}]'::jsonb where slug in ('green-morning', 'wild-meadow', 'little-thanks', 'sakura-breath', 'white-serenade');
update public.products set add_ons = '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500},{"id":"balloon","name_en":"Celebration balloon","name_ar":"بالون احتفالي","name_fr":"Ballon de fête","price_minor":1200}]'::jsonb where slug = 'sunlit-stems';
update public.products set add_ons = '[{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","name_fr":"Chocolat noir","price_minor":1800}]'::jsonb where slug in ('terracotta-love', 'roses-in-a-box');
update public.products set add_ons = '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500},{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","name_fr":"Chocolat noir","price_minor":1800}]'::jsonb where slug in ('midnight-roses', 'petal-box', 'grand-roses');
```

- [ ] **Step 2: Update `supabase/seed.sql`** so fresh setups carry French

For the `categories` insert: add `name_fr` to the column list and each row (`Bouquets main`, `Arrangements en vase`, `Plantes`, `Coffrets cadeaux`, `Condoléances`), and add `name_fr = excluded.name_fr` to the `on conflict` update.
For the `cities` insert: add `name_fr` (values from the migration above) and `name_fr = excluded.name_fr` to the conflict update.
For `product_variants`: add `name_fr` using the `name_en`-keyed values above, plus `name_fr = excluded.name_fr` in the conflict update.
For `products`: add `name_fr, description_fr` to the column list and each row (values from the migration above), add the `name_fr` inside each `add_ons` jsonb element (from the migration above), and add `name_fr = excluded.name_fr, description_fr = excluded.description_fr` to the conflict update.

- [ ] **Step 3: Apply the migration to the live project**

Run: `cd /d/Next.js_Projects/rosette && supabase db push`
Expected: migration `003_french_localization.sql` applied.

- [ ] **Step 4: Verify the live data**

Run (service role REST; do not print the key):
```bash
URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL' .env.local | cut -d= -f2- | tr -d '"')
KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY' .env.local | cut -d= -f2- | tr -d '"')
curl -s "$URL/rest/v1/products?slug=eq.rose-hour&select=slug,name_fr,description_fr" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
curl -s "$URL/rest/v1/cities?code=eq.alexandria&select=code,name_fr" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
curl -s "$URL/rest/v1/products?slug=eq.rose-hour&select=add_ons" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```
Expected: `name_fr: "L’Heure des Roses"`, `name_fr: "Alexandrie"`, add_ons elements include `"name_fr":"Carte manuscrite"`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/003_french_localization.sql supabase/seed.sql
git commit -m "feat: add French columns and backfill translations for catalog content"
```

---

### Task 3: Catalog + Order Data Layer

**Files:**
- Modify: `features/commerce/db-types.ts`
- Modify: `features/catalog/types.ts`
- Modify: `features/catalog/supabase-repository.ts`
- Modify: `features/catalog/row-mappers.ts`
- Modify: `features/catalog/data.ts`
- Modify: `features/destination/types.ts`
- Modify: `features/destination/data.ts`
- Modify: `features/order/supabase-repository.ts`
- Modify: `tests/domain/catalog-repository.test.ts`

**Interfaces:**
- Produces: `Product` gains `nameFr?: string; descriptionFr?: string`; `ProductVariant` and `AddOn` gain `nameFr?: string`; `City` gains `nameFr?: string`; `order_items` writes/reads `product_name_fr`.
- Consumes: `Locale`, `pickLocalized` from Task 1.

- [ ] **Step 1: Update the failing test `tests/domain/catalog-repository.test.ts`**

Add `name_fr`/`description_fr` to the row and assert the mapping:
```ts
name_fr: 'L’Heure des Roses',
description_fr: 'Des roses de jardin douces',
```
and to the expected object:
```ts
nameFr: 'L’Heure des Roses',
descriptionFr: 'Des roses de jardin douces',
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/domain/catalog-repository.test.ts`
Expected: FAIL — `nameFr` is `undefined`.

- [ ] **Step 3: Update the row shapes and mappers**

`features/commerce/db-types.ts` — add to the product row type: `name_fr?: string; description_fr?: string;`.

`features/catalog/types.ts`:
```ts
export type ProductVariant = { id: string; name: string; nameFr?: string; priceDelta: number };
export type AddOn = { id: string; name: string; nameFr?: string; price: number };
export type Product = { slug: string; name: string; nameAr?: string; nameFr?: string; description: string; descriptionAr?: string; descriptionFr?: string; category: string; occasions: string[]; price: number; tone: string; inventory: number; delivery: string; createdAt: string; variants: ProductVariant[]; addOns: AddOn[] };
```

`features/catalog/row-mappers.ts` — extend `SupabaseProductRow` with `name_fr?: string; description_fr?: string;`, `name_fr?: string` on the add-on and variant shapes, then map:
```ts
nameFr: row.name_fr,
descriptionFr: row.description_fr,
```
and in the variants/add-ons maps: `nameFr: variant.name_fr` / `nameFr: addOn.name_fr`.

`features/catalog/supabase-repository.ts` — extend `productSelect`:
```ts
const productSelect = 'slug,name_en,name_ar,name_fr,description_en,description_ar,description_fr,category,occasions,price_minor,tone,delivery,created_at,add_ons,product_variants(id,name_en,name_ar,name_fr,price_delta_minor,inventory(quantity,reserved_quantity))';
```

`features/destination/types.ts`:
```ts
export type City = { code: string; name: string; nameAr: string; nameFr?: string; countryCode: string; sameDay: boolean };
```

`features/destination/data.ts` — add `nameFr` to each of the 11 city objects: `'Le Grand Caire'`, `'Alexandrie'`, `'Mansourah'`, `'Zagazig'`, `'Tanta'`, `'Menoufia'`, `'Côte Nord'`, `'Aïn Sokhna'`, `'Ismaïlia'`, `'Benha'`, `'Suez'`.

`features/catalog/data.ts` — add `nameFr`/`descriptionFr` to the 8 mock products using the same French values as the migration (Task 2 Step 1).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/domain/catalog-repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the order repository snapshot (`features/order/supabase-repository.ts`)**

In `ProductRow` add `name_fr?: string`; add `name_fr` to the product select; in `authoritativeLines` return `productNameFr: product.name_fr`; in the `order_items` insert add:
```ts
product_name_fr: (line as { productNameFr?: string }).productNameFr ?? '',
```
Update `app/api/orders/[id]/route.ts` select to include `product_name_fr` on `order_items` (the public order detail read).

- [ ] **Step 6: Run typecheck + full domain tests**

Run: `npx tsc --noEmit && npx vitest run tests/domain`
Expected: clean, all PASS.

- [ ] **Step 7: Commit**

```bash
git add features/commerce features/catalog features/destination features/order app/api/orders/\[id\]/route.ts tests/domain/catalog-repository.test.ts
git commit -m "feat: thread French fields through catalog, destination, and order data layers"
```

---

### Task 4: Storefront Consumers

**Files:**
- Modify: `features/catalog/ProductCard.tsx`
- Modify: `features/product/ProductDetail.tsx`
- Modify: `features/cart/CartLineItem.tsx`
- Modify: `features/destination/DestinationGate.tsx`
- Modify: `features/order/OrderPageContent.tsx`
- Modify: `app/page.tsx`
- Modify: `features/checkout/CheckoutForm.tsx`
- Modify: `features/chat/ChatWidget.tsx`
- Modify: `components/support/WhatsAppButton.tsx`

**Interfaces:**
- Consumes: `pickLocalized`, `formatMoney`, dictionary keys from Task 1 (including `orderCreateFailed`, `paymentConfirmed`, `chatTitle`, `whatsappChat`, …).

- [ ] **Step 1: Convert content picks to `pickLocalized`**

- `features/catalog/ProductCard.tsx`: `const name = pickLocalized(locale, { en: product.name, ar: product.nameAr, fr: product.nameFr });` and the same for `description`. Use `formatMoney(product.price, locale)`.
- `features/product/ProductDetail.tsx`: same `name`/`description` picks; replace the inline `Intl.NumberFormat(...)` price with `formatMoney(unitPrice, locale)`.
- `features/cart/CartLineItem.tsx`: product name via `pickLocalized(locale, { en: line.productName, ar: line.productNameAr, fr: line.productNameFr })` (add `productNameFr?: string` to the cart line type in `features/cart/types.ts`); for add-ons, map known ids through `t()` for **all** locales: `const addOnLabel = (addOn) => addOn.id === 'note' ? t('handwrittenNote') : addOn.id === 'chocolate' ? t('darkChocolate') : addOn.id === 'balloon' ? t('balloon') : addOn.name;`.
- `features/destination/DestinationGate.tsx`: `pickLocalized(locale, { en: city.name, ar: city.nameAr, fr: city.nameFr })`.
- `features/order/OrderPageContent.tsx`: item name via `pickLocalized(locale, { en: item.productName, ar: item.productNameAr, fr: item.productNameFr })`; replace the `paymentCopy` ternary with `t('paymentConfirmed')` / `t('paymentPending')`; replace the inline `Intl.NumberFormat` with `formatMoney(..., locale)`.
- `app/page.tsx` (home hero city name): `const cityName = city ? pickLocalized(locale, { en: city.name, ar: city.nameAr, fr: city.nameFr }) : undefined;`

- [ ] **Step 2: Move hardcoded strings to the dictionary**

- `features/checkout/CheckoutForm.tsx`: replace the four `locale === 'ar' ? … : …` messages with `t('orderCreateFailed')`, `t('onlinePaymentNotConfigured')`, `t('demoPaymentFailed')`, `t('temporaryError')`; replace the inline total `Intl.NumberFormat` with `formatMoney(liveTotal, locale)`.
- `features/chat/ChatWidget.tsx`: replace the `copy` object with `const copy = { title: t('chatTitle'), open: t('chatOpen'), close: t('chatClose'), placeholder: t('chatPlaceholder'), send: t('chatSend'), fallback: t('chatFallback') };` and the WhatsApp link label with `t('talkToTeam')`.
- `components/support/WhatsAppButton.tsx`: `{t('whatsappChat')} ↗`.

- [ ] **Step 3: Verify in the browser**

Run: `npx tsc --noEmit` and start the dev server. In headless Chrome (or manually) load `/` and `/shop/rose-hour` with the locale cookie set: `document.cookie='rosette.locale=fr'`, reload, confirm French labels, product names, and city names render.

- [ ] **Step 4: Commit**

```bash
git add features/catalog/ProductCard.tsx features/product/ProductDetail.tsx features/cart features/destination/DestinationGate.tsx features/order/OrderPageContent.tsx app/page.tsx features/checkout/CheckoutForm.tsx features/chat/ChatWidget.tsx components/support/WhatsAppButton.tsx
git commit -m "feat: render storefront content in French via pickLocalized and dictionary keys"
```

---

### Task 5: Order Locale + Emails

**Files:**
- Modify: `features/notifications/email-types.ts`
- Modify: `features/notifications/email-templates.ts`
- Modify: `features/order/types.ts`
- Modify: `app/api/orders/route.ts`
- Modify: `app/api/webhooks/paymob/route.ts`
- Modify: `features/admin/order-actions.ts`
- Modify: `tests/domain/email-templates.test.ts`

**Interfaces:**
- Produces: `EmailLocale = 'en' | 'ar' | 'fr'`; `CreatePendingOrderInput.locale: Locale`; orders persist `locale` and emails render in it.
- Consumes: dictionary keys from Task 1.

- [ ] **Step 1: Extend the failing email test**

In `tests/domain/email-templates.test.ts` add:
```ts
it('renders French as LTR with a French subject and body', () => {
  const email = renderOrderEmail({ locale: 'fr', type: 'payment_confirmed', orderNumber: 'RO-1', totalMinor: 12500, orderUrl: 'https://example.com/orders/1' });
  expect(email.html).toContain('dir="ltr"');
  expect(email.html).toContain('lang="fr"');
  expect(email.subject).toBe('Paiement confirmé');
  expect(email.html).toContain('Votre commande');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/domain/email-templates.test.ts`
Expected: FAIL — `'fr'` not assignable / subject missing.

- [ ] **Step 3: Update email types and templates**

`features/notifications/email-types.ts`:
```ts
export type EmailLocale = 'en' | 'ar' | 'fr';
```

`features/notifications/email-templates.ts`:
- `subjects` gains a `fr` object: `{ order_received: 'Commande reçue', payment_confirmed: 'Paiement confirmé', payment_failed: 'Paiement échoué', preparing: 'Votre commande est en préparation', out_for_delivery: 'Votre commande est en cours de livraison', delivered: 'Votre commande a été livrée' }`.
- Replace `isArabic` with a locale tag helper:
```ts
const intlLocales = { en: 'en-EG', ar: 'ar-EG', fr: 'fr-FR' } as const;
const isArabic = input.locale === 'ar';
const isFrench = input.locale === 'fr';
const total = new Intl.NumberFormat(intlLocales[input.locale], { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(input.totalMinor / 100);
const title = isArabic ? 'تحديث طلبك' : isFrench ? 'Mise à jour de votre commande' : 'Your order update';
const body = isArabic ? `رقم طلبك هو ${order}. إجمالي الطلب ${escapeHtml(total)}.` : isFrench ? `Votre numéro de commande est ${order}. Le total de la commande est ${escapeHtml(total)}.` : `Your order number is ${order}. The order total is ${escapeHtml(total)}.`;
const link = isArabic ? 'عرض الطلب' : isFrench ? 'Voir la commande' : 'View order';
const direction = isArabic ? 'rtl' : 'ltr';
```

- [ ] **Step 4: Thread `Locale` through order creation**

`features/order/types.ts`:
```ts
import type { Locale } from '@/features/i18n/types';
export type CreatePendingOrderInput = { cart: Cart; destination: Destination; checkout: CheckoutInput; locale: Locale };
```

`app/api/orders/route.ts` — replace the locale guard:
```ts
if (!body.destination || !body.checkout || (body.locale !== 'ar' && body.locale !== 'en' && body.locale !== 'fr')) return NextResponse.json({ error: 'Incomplete checkout details' }, { status: 400 });
```

`app/api/webhooks/paymob/route.ts` — replace `locale: order.locale === 'ar' ? 'ar' : 'en'` with:
```ts
locale: order.locale === 'ar' || order.locale === 'fr' ? order.locale : 'en',
```

`features/admin/order-actions.ts` — widen `OrderRow.locale` to `'en' | 'ar' | 'fr'` (it already passes `order.locale` through to `sendNotification`).

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/domain/email-templates.test.ts tests/domain/notification-service.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add features/notifications features/order/types.ts app/api/orders/route.ts app/api/webhooks/paymob/route.ts features/admin/order-actions.ts tests/domain/email-templates.test.ts
git commit -m "feat: support French in order emails and order locale flow"
```

---

### Task 6: WhatsApp + Chat Assistant

**Files:**
- Modify: `features/support/whatsapp.ts`
- Modify: `tests/domain/whatsapp.test.ts`
- Modify: `features/chat/types.ts`
- Modify: `features/chat/response-schema.ts`
- Modify: `features/chat/groq-assistant.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `tests/domain/chat-response.test.ts`

**Interfaces:**
- Produces: `createWhatsAppHref({ locale: 'en' | 'ar' | 'fr' })`; `ChatResponse.language: 'en' | 'ar' | 'fr'`; `answerStoreQuestion({ language: 'en' | 'ar' | 'fr' })`.
- Consumes: dictionary keys `whatsappChat`/`talkToTeam` (Task 4 already renders them).

- [ ] **Step 1: Extend the failing tests**

`tests/domain/whatsapp.test.ts` add:
```ts
it('uses French copy when the locale is French', () => {
  expect(createWhatsAppHref({ number: '201000000000', locale: 'fr' })).toContain('Bonjour%20Rosette');
});
```

`tests/domain/chat-response.test.ts` add:
```ts
it('accepts French as a response language', () => {
  expect(parseChatResponse({ answer: 'Oui, nous livrons au Caire.', language: 'fr', action: 'none' })).toEqual({ answer: 'Oui, nous livrons au Caire.', language: 'fr', action: 'none' });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/whatsapp.test.ts tests/domain/chat-response.test.ts`
Expected: FAIL — locale type rejects `'fr'`.

- [ ] **Step 3: Update WhatsApp**

`features/support/whatsapp.ts`:
```ts
export function createWhatsAppHref(input: { number: string; locale: 'ar' | 'en' | 'fr'; orderId?: string }): string | null {
  const number = normalizeNumber(input.number);
  if (!number) return null;
  const message = input.locale === 'ar'
    ? `مرحبا روزيت، أحتاج إلى مساعدة${input.orderId ? ` بخصوص الطلب ${input.orderId}` : ''}.`
    : input.locale === 'fr'
      ? `Bonjour Rosette, j’ai besoin d’aide${input.orderId ? ` avec la commande ${input.orderId}` : ''}.`
      : `Hello Rosette, I need help${input.orderId ? ` with order ${input.orderId}.` : '.'}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
```
and widen `getConfiguredWhatsAppHref`'s `locale` the same way.

- [ ] **Step 4: Update chat**

`features/chat/types.ts`:
```ts
export type ChatResponse = { answer: string; language: 'en' | 'ar' | 'fr'; action: ChatAction; productSlugs?: string[]; requiresHuman?: boolean };
```

`features/chat/response-schema.ts`:
```ts
if (candidate.language !== 'en' && candidate.language !== 'ar' && candidate.language !== 'fr') return null;
```

`features/chat/groq-assistant.ts`:
- `fallback` and `answerStoreQuestion` take `language: 'en' | 'ar' | 'fr'`.
- `fallback`: `language === 'ar' ? … : language === 'fr' ? 'Je ne peux aider qu’avec les fleurs, les produits, la livraison et les commandes. Contactez-nous sur WhatsApp pour obtenir de l’aide.' : 'I can help only with flowers, products, delivery, and orders. Use WhatsApp to reach our team.'`
- order-lookup message: add `: language === 'fr' ? 'Veuillez fournir votre numéro de commande et votre numéro de téléphone pour vérifier la commande.' : …`
- unavailable message: add `: language === 'fr' ? 'L’assistant intelligent est indisponible pour le moment. Notre équipe peut vous aider sur WhatsApp.' : …`

`app/api/chat/route.ts`:
```ts
const language = body.language === 'ar' ? 'ar' : body.language === 'fr' ? 'fr' : 'en';
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/domain/whatsapp.test.ts tests/domain/chat-response.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add features/support/whatsapp.ts features/chat app/api/chat/route.ts tests/domain/whatsapp.test.ts tests/domain/chat-response.test.ts
git commit -m "feat: support French in WhatsApp messages and the chat assistant"
```

---

### Task 7: Admin UI Localization

**Files:**
- Create: `features/i18n/server.ts`
- Modify: `app/admin/page.tsx`
- Modify: `app/admin/orders/page.tsx`
- Modify: `app/admin/orders/[id]/page.tsx`
- Modify: `app/admin/products/page.tsx`
- Modify: `app/admin/inventory/page.tsx`
- Modify: `app/admin/delivery/page.tsx`
- Modify: `components/admin/OrderListToolbar.tsx`
- Modify: `components/admin/OrderActions.tsx`

**Interfaces:**
- Consumes: `cookies()` (Next 16), `messages` from Task 1, `formatMoney` from Task 1, `useI18n` (client admin components).
- Produces: `getServerT(): Promise<{ locale: Locale; t: (key: string, values?: Record<string, string | number>) => string }>`.

- [ ] **Step 1: Create `features/i18n/server.ts`**

```ts
import { cookies } from 'next/headers';
import { messages } from './dictionaries';
import type { Locale } from './types';

export async function getServerT() {
  const store = await cookies();
  const saved = store.get('rosette.locale')?.value;
  const locale: Locale = saved === 'ar' || saved === 'fr' ? saved : 'en';
  const t = (key: string, values?: Record<string, string | number>) => {
    let text = messages[locale][key] ?? messages.en[key] ?? key;
    for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
  return { locale, t };
}
```

- [ ] **Step 2: Localize the six admin server pages**

In each page, add `const t = await getServerT();` (after the `redirect` guard) and replace hardcoded labels:

- `app/admin/page.tsx`: `t('adminEyebrow')`, `t('adminDashboard')`, `t('signedInAs', { role: admin.role })`, `t('orders')`, `t('products')`, `t('inventory')`, `t('deliveryRules')`, `t('signOut')`.
- `app/admin/orders/page.tsx`: `const { t, locale } = await getServerT();` then `t('customerOrders')`, `t('orders')`, `t('noOrdersMatch')`; replace `money()` with `formatMoney(order.total_minor, locale)`.
- `app/admin/orders/[id]/page.tsx`: `t('orders')`, `t('orderNotFound')`, `t('backToOrders')`, `t('recipientAndDelivery')`, `t('items')`, `t('payment')`, `t('timeline')`, `t('updateStatus')`, `t('contactOnWhatsApp')`; use `formatMoney(..., locale)`.
- `app/admin/products/page.tsx`: `t('catalogOperations')`, `t('products')`, `t('active')`, `t('inactive')`.
- `app/admin/inventory/page.tsx`: `t('stockOperations')`, `t('inventory')`, `t('available')`, `t('reserved')`.
- `app/admin/delivery/page.tsx`: `t('deliveryOperations')`, `t('deliveryRules')`, `t('active')`, `t('inactive')`.

- [ ] **Step 3: Localize the client admin components**

`components/admin/OrderListToolbar.tsx` — `const { t } = useI18n();` and replace `Search`, `Payment`, `Fulfillment`, `All`, `Filter`, and the placeholder with `t('adminSearch')`, `t('paymentFilter')`, `t('fulfillmentFilter')`, `t('all')`, `t('filter')`, `t('adminSearchPlaceholder')`. Keep the raw status option values (they are codes, not labels).

`components/admin/OrderActions.tsx` — `const { t } = useI18n();`; replace `labels` values with `t('statusConfirmed')` etc. (build the label inside render: `t(statusLabelKeys[status])`), and `t('updating')`, `t('couldNotUpdateOrder')`.

- [ ] **Step 4: Verify in the browser**

With the dev server running: sign in to `/admin`, set `document.cookie='rosette.locale=fr'`, reload — the dashboard, orders list, order detail, products, inventory, and delivery pages render French labels; the toolbar and status buttons are French too. Typecheck: `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add features/i18n/server.ts app/admin components/admin
git commit -m "feat: localize the admin UI via a cookie-based server translator"
```

---

## Self-Review Notes

- **Spec coverage:** §1 → Task 1; §2 → Task 2; §3 → Task 3; §4 → Task 4; §5 → Task 5; §6 → Task 6; §7 → Task 7; §8 (tests) → each task carries its tests plus the two new test files in Task 1.
- **Type consistency:** `Locale`, `pickLocalized`, `formatMoney`, `getServerT` signatures are defined once (Task 1) and reused verbatim; `EmailLocale` (Task 5) widens to the same three values; `ChatResponse.language` (Task 6) matches.
- **Placeholder scan:** every translation value and every code block is written out in the task where it is used; no "similar to Task N" references.
- **Note for executor:** the add-ons jsonb backfill in Task 2 rewrites each product's `add_ons` to match `seed.sql` exactly — do not reorder or drop elements.
