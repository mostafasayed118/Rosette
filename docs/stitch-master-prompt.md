# Google Stitch Master Prompt — Rosette

Copy the MASTER PROMPT into Stitch first to establish the design system,
then use the individual SCREEN PROMPTS below for each page.

---

## MASTER PROMPT (paste first)

Design system for **Rosette**, a premium flower delivery e-commerce boutique serving Egyptian cities (Cairo, Alexandria, Giza). Bilingual English/Arabic (RTL-aware). The brand voice is restrained, editorial, and quietly romantic — "Thoughtful stems, quietly unforgettable." Think of a well-lit florist atelier crossed with a Kinfolk magazine spread: warm, tactile, unhurried.

### Atmosphere
- Gallery-airy density with generous whitespace; editorial asymmetry over rigid symmetry
- Warm and organic, never corporate or techy. Feels like premium stationery and fresh petals
- Motion intent: gentle spring physics (stiffness 100, damping 20), staggered cascade reveals on lists, subtle perpetual shimmer on skeleton loaders only

### Color Palette (use exactly these roles)
- **Warm Cream Canvas** (#FAF7F2) — primary page background
- **Pure Surface White** (#FFFFFF) — cards, sheets, modals
- **Petal Muted** (#F3EEE6) — secondary surfaces, chips, hover fills
- **Charcoal Ink** (#2D2A26) — primary text (never pure black #000000)
- **Stone Muted Ink** (#6D675F) — secondary text, metadata, captions
- **Rosette Rose** (#C2456D) — THE single accent: CTAs, active states, focus rings, price highlights. Hover deepens to #A83358. Soft tint #FAE3EA for badges and selected chips
- **Sage Whisper** (#6F8F6D) — secondary accent ONLY for success states, delivery promises, and focus outlines
- **Linen Border** (#E7DFD4) — 1px structural borders, dividers
- Dark mode variant: canvas #1A211E (deep moss), surface #232A26, ink #ECE7DF, rose lightens to #D96A8E

### Typography
- **Display/Headlines:** Fraunces (or Instrument Serif) — track-tight, weight-driven hierarchy, controlled scale via clamp(2.5rem, 6vw, 4.5rem). Editorial warmth, never screaming
- **Body/UI:** Outfit or Satoshi — relaxed leading (1.5–1.6), max 65 characters per line
- **Numbers/Meta:** JetBrains Mono for prices, order IDs, timestamps
- Arabic: IBM Plex Sans Arabic as full fallback stack; layouts must mirror cleanly for RTL
- Hierarchy through weight and color contrast, not just size

### Component Behavior
- **Buttons:** Flat fill, no outer glow, no gradients. Tactile -1px translate on press. Primary = Rosette Rose fill with white text; secondary = ghost outline in Charcoal Ink; tertiary = text link with underline on hover. Minimum 44px tap targets
- **Cards:** Rounded corners 16–24px, warm-tinted diffused shadow (rgba(45,42,38,0.08)), Linen Border hairline. Use elevation sparingly — hierarchy first
- **Inputs:** Label above field, helper text optional, error message below in danger red (#C0392B). Focus ring in Sage Whisper, 3px offset outline
- **Chips/Filters:** Pill-shaped (999px radius), Petal Muted default, Rosette Rose tint when selected
- **Loading:** Skeletal shimmer blocks matching exact layout dimensions — never circular spinners
- **Empty states:** Composed illustrated compositions with a single clear action, not bare "no data" text

### Layout Principles
- Max content width 1280px centered, generous internal padding
- Hero sections are ASYMMETRIC: split-screen or left-aligned with breathing room — centered heroes are forbidden
- Product grids: asymmetric masonry or 2-column editorial zig-zag — never 3 equal columns of identical cards
- No overlapping elements; every element owns clean spatial separation
- Mobile-first collapse below 768px: all multi-column layouts become single column, zero horizontal scroll
- Full-height sections use 100dvh, not 100vh

### Strictly Forbidden (AI tells)
- No emojis anywhere in UI
- No Inter font, no Times New Roman/Georgia serifs
- No pure black (#000000), no neon glows, no purple/blue gradient aesthetics
- No AI copywriting clichés ("Elevate", "Seamless", "Unleash", "Next-Gen")
- No filler text ("Scroll to explore", bouncing chevrons, scroll arrows)
- No generic placeholder names ("John Doe", "Acme") — use realistic names like "Nour Hassan", "Youssef Adel"
- No fake round numbers — prices like EGP 485, EGP 1,240
- No broken stock images — use picsum.photos seeds or elegant SVG botanical illustrations

Platform: Responsive web, desktop-first (1440px) collapsing gracefully to mobile (375px).

---

## SCREEN PROMPTS

### 1. Homepage
Homepage for Rosette flower delivery. Asymmetric split-screen hero: left side has eyebrow "The Rosette edit · fresh for the moment" in small caps, headline "Flowers that say it before you do." in large Fraunces serif with an inline rounded photo of ranunculus embedded between the words at type-height, lede paragraph, and ONE primary CTA "Explore the collection" in Rosette Rose. Right side: tall editorial photo of hand-tied bouquet against warm cream backdrop with soft organic shadow. Below hero: horizontal-scrolling featured bouquets strip with name, from-price in mono, same-day delivery badge in sage. Then a 2-column editorial section ("Choose a feeling, then let us handle the details") pairing occasion categories with photography. Footer with city selector, gift note info, bilingual language toggle. Use the master palette exactly.

### 2. Destination Gate
City selection screen shown before shopping. Centered-left composition: eyebrow "A little joy, delivered", headline "Choose where the feeling is going.", country dropdown (Egypt) and city dropdown (Cairo, Alexandria, Giza) styled as large pill selects, primary CTA "Continue to the collection". Right side: soft illustration of a courier bicycle with flowers. Small link below: "Can't find your country? Request us to start there." Warm cream background, generous whitespace, no clutter.

### 3. Collection / Shop Page
Product listing page titled "Something for the feeling." with count eyebrow "The collection · 24 gestures". Sticky filter bar: search input ("Find a feeling"), category chips (Bouquets, Plants, Dried, Extras), occasion chips (Love, Birthday, Congratulations, Sympathy), sort dropdown. Products in asymmetric 2-column grid with varied image heights: photo, name, "From EGP 485" in mono, same-day/next-day delivery tag in sage pill. Hover lifts card slightly with warm shadow. Empty state composition if filters return nothing with reset link.

### 4. Product Detail
Product page for a bouquet. Left: large gallery with thumbnail rail, natural photography on cream backdrop. Right column: product name in Fraunces, price in mono, size selector as three pill options (Petite / Classic / Grand with EGP prices), quantity stepper, gift note textarea labeled "رسالة الهدية · optional" with character hint, delivery date picker showing available slots, prominent "Add to bag" button in Rosette Rose, trust row with sage icons: same-day delivery before 3pm, hand-tied fresh, care instructions. Below: reviews section with rating summary, review cards with helpful-vote buttons, and "Write a review" ghost button.

### 5. Bag & Checkout
Two-step checkout. Step 1 — Bag summary: line items with thumbnail, name, size, editable quantity, remove link; gift note preview card; subtotal/delivery/total rows with total emphasized in mono. Step 2 — Delivery & payment: address form with Egyptian city select, delivery date picker, payment method cards (Card via Paymob, Cash on delivery) as selectable radio cards, place order CTA. Progress indicator across top. Inline validation errors below fields in danger red.

### 6. Gift Card Purchase
Gift card purchase page. Left: live-preview of the digital gift card — elegant card design with Rosette Rose gradient-free flat design, recipient name, amount in mono, personal message rendered in script-style typography. Right: form with amount presets (EGP 300/500/1000/custom), recipient email, sender name, message textarea, delivery date, "Send this gesture" primary CTA. Reassurance row: never expires, redeemable sitewide.

### 7. Order Tracking
Order tracking page with calm reassurance tone. Header: order number in mono, estimated delivery window in sage. Vertical fulfillment timeline with four stages (Confirmed, Hand-tied, Out for delivery, Delivered) — completed stages filled in Rosette Rose, current stage pulsing gently, future stages in Linen Border. Each stage shows timestamp. Below: order contents summary card and support contact link. If cancelled: composed empty-state style notice with reorder CTA.

### 8. Account Dashboard
Customer account dashboard. Left sidebar navigation: Orders, Wishlist, Reviews, Email preferences, Profile. Main area: greeting "Good evening, Nour", stat cards (orders placed, wishlist items, reviews written) using border-top dividers instead of heavy cards, recent orders table with status pills (Delivered in sage, In transit in rose tint, Cancelled in stone), wishlist horizontal strip with quick add-to-bag. Clean, airy, data-focused but warm.

---

## ADDED SCREENS (generated 2026-08-21)

### Wishlist — "Saved for Later"
Wishlist page titled "Saved for later." with eyebrow "Your quiet list" and count "6 saved gestures" in mono. Asymmetric 2-column editorial grid with varied image heights: bouquet photo on cream backdrop, name in Fraunces, saved price in mono; sage pills "Dropped EGP 95" / "Back in stock" where applicable; "Move to bag" ghost button + heart remove icon per card. Alert chips at top: "Price drop alerts" and "Back-in-stock alerts" enabled in rose tint.
Status: GENERATED (screen `328083f65aa24301b4a21c07c8cc01e8`) — imagery re-generated with real flower photography in `3937604d584041dba51680f318890389` "Updated Photography" version; delete the original geometric-art version. 4 standalone flower photo assets also generated for reuse.

### Reviews Detail
Page for bouquet "The Cairo Sunset". Rating summary: large 4.8 in Fraunces, 5 stars rose-filled, "127 reviews" mono, descending distribution bars. Review column separated by Linen hairlines: reviewer names (Nour Hassan, Youssef Adel), star rows, mono dates, relaxed review text, rounded photo thumbnails on some reviews, Helpful (14) pill buttons (voted = rose tint, unvoted = Petal Muted), one sage "Verified Purchase" badge. "Write a review" rose button top right.
Status: GENERATED (`8ee87617df204963ab7af5d2f7be1d1b` + 2 duplicates `21e7bf3edf5f46ecabfc4cb69576b329`, `ceae5d70844e4fc891e983f7b325466e` — delete extras in Stitch UI). Rating summary, distribution bars, verified badges, photo thumbnails, helpful votes all rendered.

### Email Preferences — "How we reach you."
Account settings page. Left sidebar nav (Email preferences active as rose pill). Master toggle "Engagement emails" ON in rose. Grouped rows with hairline separators and toggles: Order updates (locked, sage lock icon), Abandoned bag reminder ON, Wishlist price drops ON, Back-in-stock alerts ON, Seasonal collection notes OFF. Sage inline success "Preferences saved with care." Language radio chips English/العربية/Français. Save Changes rose button.
Status: GENERATED (screen `54531ac9a415415fa3b4e335437e5236`)

---

## ITERATION CHEAT SHEET (annotate-to-edit phrases)

- "Make the CTA larger and deepen the rose to #A83358"
- "Increase whitespace between sections to feel more gallery-like"
- "Swap this grid to asymmetric two-column with varied image heights"
- "Mirror this layout for RTL Arabic"
- "Replace this spinner with a skeletal shimmer matching the card shape"
