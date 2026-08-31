# Rosette Visual UI/UX Review

## Review basis

This review analyzes the supplied composite capture of five desktop storefront screens:

1. Editorial homepage
2. Collection / shop listing
3. Product detail
4. Bag / checkout
5. Order tracking

It also cross-checks the current source components to separate visible issues in the supplied captures from issues that may already be partially fixed in the working tree. No mobile capture was supplied, so responsive findings are marked as either source-level risks or validation requirements rather than confirmed visual defects.

## Overall assessment

**Visual direction: strong and differentiated.** The warm cream canvas, rose conversion color, editorial serif headlines, botanical photography, and asymmetrical image rhythm give Rosette a clear premium identity.

**Main UX risk: too much restraint in functional UI.** Several labels, prices, statuses, borders, and controls are so small or faint that the interface feels elegant at first glance but becomes harder to scan, compare, and operate. The next pass should preserve the calm editorial tone while increasing functional contrast, reducing unused space in task screens, and standardizing control geometry.

### Priority summary

| Priority | Theme | Why it matters |
|---|---|---|
| P0 | Checkout CTA and form scanability | Highest impact on purchase completion |
| P0 | Contrast and status legibility | Affects comprehension and WCAG compliance |
| P0 | Language consistency | The supplied PDP capture mixes English and Arabic |
| P1 | Collection grid rhythm and product comparison | Directly affects browsing efficiency |
| P1 | Header / sticky utility density | Affects navigation and responsive behavior |
| P1 | Component geometry and token consistency | Makes screens feel like one product |
| P1 | Custom control semantics and focus | Keyboard and assistive technology usability |
| P2 | Tracking clarity and next actions | Reduces post-purchase uncertainty |
| P2 | Visual regression coverage | Prevents future drift across widths/locales |

---

## Detailed findings

### P0-01 — Functional text and statuses are too faint

**Affected screens/components**

- Collection cards: delivery badges, product descriptions, prices, and filter labels.
- Product detail: category/delivery eyebrow, price, option price deltas, gift-note metadata, and service badges.
- Checkout: form labels, helper copy, payment metadata, and summary details.
- Tracking: future timeline states and timestamps.
- Source areas: `app/globals.css`, `features/catalog/ProductCard.tsx`, `features/product/ProductDetail.tsx`, `app/[locale]/[city]/track/page.tsx`.

**Problem**

The capture repeatedly uses very small mono/uppercase metadata and low-opacity neutral text on warm cream surfaces. The tracking screen is the clearest example: future statuses such as “Out for delivery” and “Delivered” are rendered in a very light grey, while `--:--` looks like a missing value rather than a pending state.

**Impact**

Users must work harder to compare delivery promises, prices, option costs, and order state. Low-contrast text also risks WCAG AA failure for normal-sized text and makes the experience less usable for low-vision users or on bright mobile screens.

**Recommendation**

- Reserve muted text for secondary copy, not essential decision data.
- Create explicit semantic tokens: `ink`, `ink-muted`, `ink-subtle`, `sage-ink`, `status-pending`, and `border-strong`.
- Use a darker sage text token for small eyebrows and delivery metadata; the current `#6f8f6d` is approximately **3.37:1** against the light canvas.
- Replace `--:--` with text such as “Not yet dispatched” or “Pending update”; keep the inactive state visually quiet without looking broken.
- Set minimum functional text to 14px, with 16px for field labels and key helper text.

**Success check**

All essential labels, prices, delivery promises, error messages, and active/inactive states pass WCAG AA in light and dark themes and remain readable at 200% text zoom.

---

### P0-02 — Checkout primary action is visually detached and undersized

**Affected screen/components**

- Bag / checkout capture: “Place Order” button.
- Source: `features/checkout/CheckoutForm.tsx` and the checkout page layout.

**Problem**

The checkout CTA appears as a small button floating toward the lower-right edge of the main form column, while the order total is inside the separate right-hand summary card. The most important action is therefore not anchored to the total it submits and does not visually dominate the page.

**Impact**

The user has to scan between columns to understand what they are paying and where to submit. The CTA looks like a secondary action even though it is the conversion endpoint. On mobile, this pattern can become even less clear when the summary stacks above or below the form.

**Recommendation**

- Make the CTA full width within the primary checkout section or place it directly beneath the total in the sticky summary.
- Keep the total and “Place order” action in the same visual group.
- Use a stronger vertical relationship: summary total → security/payment reassurance → primary CTA.
- Preserve the rose button, but increase its height to at least 48px and use a clear action label plus total.
- Add a secondary “Back to bag” link nearby, visually subordinate.

**Success check**

A first-time user can identify the amount due and the final submission action without scanning between columns.

---

### P0-03 — The supplied product-detail capture mixes languages

**Affected screen/components**

- Product detail gift-note field: Arabic label “رسالة الهدية” appears beside English product content and English “optional” text.
- Source: `features/product/ProductDetail.tsx`, `features/i18n` dictionaries, locale routing.

**Problem**

The screen appears to be English LTR but includes Arabic UI copy. This may be a stale screenshot or a locale synchronization defect, but it is a visible quality issue in the supplied capture.

**Impact**

Mixed-language UI reduces trust and can create uncertainty about whether the user is viewing the correct locale. It also affects alignment, reading direction, and form-label comprehension.

**Recommendation**

- Ensure UI strings use one resolved locale per render; do not combine browser cookie state, URL locale, and client state without a single source of truth.
- Add a visual test that asserts no Arabic-script customer-facing strings appear in the English route and no English-only strings remain in the Arabic route.
- Set `lang` and `dir` on the document before first paint and verify the gift-note label, placeholder, and optional marker as a single RTL/LTR unit.
- Treat Arabic as a full typographic mode, not an isolated translated label.

**Success check**

Every customer-facing screen is linguistically coherent in English, French, and Arabic, including labels, placeholders, status messages, and accessible names.

---

### P1-01 — Collection grid creates accidental empty space

**Affected screens/components**

- Collection / shop listing: the fourth product sits alone in the center column with a large blank area around it.
- Source: `features/catalog/CatalogGrid.tsx`, `features/catalog/ProductCard.tsx`.

**Problem**

The staggered masonry treatment is visually intentional, but in the supplied capture it reads less like editorial rhythm and more like an incomplete result set. The large empty left/right areas reduce the number of products visible per viewport and weaken comparison.

**Impact**

Users see fewer products, lose the scanning rhythm of a catalog, and may interpret the sparse grid as low inventory or a loading problem.

**Recommendation**

- Keep staggered offsets only when there are enough cards to sustain the pattern.
- For one, two, or four-item results, use a balanced grid or constrain the card row to an intentional editorial composition.
- Consider a 3-column grid with consistent card starts for browsing, then use asymmetry only in curated landing sections.
- Add an explicit result count and an empty/low-inventory explanation when the grid is sparse.

**Success check**

The first viewport supports fast product comparison without a large accidental-looking void, while curated editorial pages retain asymmetry.

---

### P1-02 — Collection product cards under-prioritize comparison data

**Affected screens/components**

- Collection product cards: image dominates, but price, delivery badge, description, and wishlist affordance are visually small.
- Source: `features/catalog/ProductCard.tsx`.

**Problem**

Delivery badges are tiny overlays and product descriptions truncate quickly. Price is pushed to the far edge in small mono type. The image and name are attractive, but the information needed to choose between arrangements is visually subordinate.

**Impact**

Users must open product pages to answer basic comparison questions, increasing interaction cost and reducing confidence in the collection view.

**Recommendation**

- Increase price prominence to at least 15–16px and keep it aligned consistently across cards.
- Make delivery promise a readable text row beneath the product name or use a slightly larger badge.
- Keep one concise differentiator visible, such as flower type or “same-day” availability.
- Give the wishlist button a stronger boundary and preserve a visible focus state.
- Do not rely on hover scale or color change to communicate that the card is interactive.

**Success check**

A user can compare name, price, delivery speed, and one differentiator across three cards without opening a detail page.

---

### P1-03 — Header hierarchy is too utility-heavy for the editorial brand

**Affected screens/components**

- Homepage, collection, product detail, checkout, and tracking header.
- Source: `components/layout/SiteHeader.tsx`.

**Problem**

The header combines logo, five nav links, destination, account, bag, wishlist, language, and theme controls. On the supplied desktop screens, the logo and nav feel visually reduced while the utility cluster creates a long, low-contrast line of small controls.

**Impact**

The header competes with the brand and increases scanning cost. On narrower desktop widths or longer French/Arabic labels, the navigation can compress or wrap unpredictably.

**Recommendation**

- Keep the brand mark and primary shopping navigation visually dominant.
- Move secondary utilities such as theme and wishlist into a utility menu on medium widths; retain bag and destination as primary commerce utilities.
- Use a shared header-height token for all sticky offsets; the working tree has started this with `--site-header-height`, but the visual states should still be verified against the captures.
- Give the destination selector a clear compact control treatment instead of small inline text.
- Test at 1024px, 1280px, 1440px, French labels, and Arabic RTL before finalizing spacing.

**Success check**

The header maintains one line without crowding at supported desktop widths, and the primary path to collections, bag, and destination remains obvious.

---

### P1-04 — Shape language is inconsistent across screens

**Affected screens/components**

- Homepage hero and editorial cards.
- Collection cards and pills.
- Product detail gallery, option pills, textarea, date input, and CTA.
- Checkout cards, inputs, date cards, and payment rows.
- Source: `app/globals.css`, `components/ui/button.tsx`, `components/ui/card.tsx`, `features/product/ProductDetail.tsx`, `features/checkout/CheckoutForm.tsx`.

**Problem**

The system mixes large rounded image frames, medium rounded cards, full pills, square-ish checkout fields, bottom-border fields, and different border weights. Each choice is defensible alone, but together the interaction language feels assembled from several templates.

**Impact**

Users cannot easily distinguish structural containers from selectable controls. The premium “paper-on-paper” design intent becomes less coherent when the same type of action changes shape across screens.

**Recommendation**

Define a small geometry contract:

- 16–20px radius for major image/content containers.
- 10–12px radius for form fields and cards.
- Full pill only for filters, compact status tags, and segmented choices.
- 1px hairline borders for structure; 2px accent border only for selected state.
- One ambient shadow token for elevated surfaces; no shadow plus lift unless the item is clearly interactive.

Then map button, card, field, filter, and selected states to those tokens instead of page-level arbitrary radii.

**Success check**

A quick visual scan can distinguish page structure, selectable state, and primary action without relying on color alone.

---

### P1-05 — Product-detail option states need stronger affordance

**Affected screen/components**

- Product detail size selector, gift note, delivery date, add-to-bag row.
- Source: `features/product/ProductDetail.tsx`.

**Problem**

The selected “Classic” option is indicated mainly by a rose border, while unselected pills are also outlined. The price delta is small and can be mistaken for disabled or crossed-out content. The gift-note field is visually quiet despite being a meaningful personalization step.

**Impact**

Users may not immediately understand which size is selected, how the price changes, or whether the gift note is optional and editable.

**Recommendation**

- Add a clear selected marker or filled tonal background, not only border color.
- Put size name and price on separate lines or use a consistent two-part layout.
- Keep the selected price visibly current and avoid styling that resembles strikethrough/disabled text.
- Add a short character counter or “optional” helper aligned to the note field.
- Make the delivery date control feel like a deliberate next step rather than a browser-default field.

**Success check**

Selection, price impact, personalization, and delivery timing are understandable without hover or color perception.

---

### P1-06 — Checkout form is visually calm but not optimally scannable

**Affected screen/components**

- Delivery Details, Delivery Date, Payment Method, and Bag Summary panels.
- Source: `features/checkout/CheckoutForm.tsx`.

**Problem**

The screenshot uses several stacked white cards with large empty regions, small labels, and limited grouping between required fields. The date selector is a useful pattern, but its selected corner ribbon is decorative rather than an immediately obvious state indicator. Payment options are visually similar and provide little explanatory reassurance.

**Impact**

The form takes more vertical attention than necessary, while critical distinctions — required information, selected date, payment method, and final total — are not emphasized enough.

**Recommendation**

- Use a consistent section header pattern with a short optional helper line only where needed.
- Group fields by task: recipient, address, delivery timing, payment.
- Add explicit “Required” or required markers where validation is not obvious.
- Use a filled selected state plus a check icon for dates and payment methods; keep the decorative corner treatment optional.
- Add concise payment reassurance such as accepted methods, secure processing, and when payment is charged.
- Keep the summary card visually sticky on desktop but move the total/CTA relationship into the mobile reading order.

**Success check**

Users can complete checkout by scanning section headings and selected states, without reading every sentence.

---

### P1-07 — Focus and non-color selection states need a visible visual treatment

**Affected screens/components**

- Product size/add-on pills.
- Checkout date buttons, saved-address buttons, and payment rows.
- Collection filter chips.
- Source: `features/product/ProductDetail.tsx`, `features/checkout/CheckoutForm.tsx`, `features/catalog/CatalogToolbar.tsx`, `app/globals.css`.

**Problem**

The supplied screenshots cannot show keyboard focus, and many controls are visually driven by border color, background tint, or opacity. Hidden radio/checkbox inputs need a clearly visible focus ring on the wrapper, and status/timeline states cannot depend on color alone.

**Impact**

Keyboard users may lose their place, while color-blind users may not distinguish selected, inactive, and pending states reliably.

**Recommendation**

- Use `:focus-visible` or `has-[input:focus-visible]` consistently on the visible wrapper.
- Pair selected color with a check icon, weight change, or text label.
- Pair timeline color with explicit status text and descriptive copy.
- Test all selected/inactive/disabled states in grayscale and at high contrast.

**Success check**

Every interactive state is visible with keyboard focus and remains understandable without color perception.

---

### P2-01 — Tracking timeline communicates state but not enough next-step certainty

**Affected screen/components**

- Order tracking timeline and order summary.
- Source: `app/[locale]/[city]/track/page.tsx`, `components/tracking/FulfillmentProgress.tsx`.

**Problem**

The confirmed and hand-tied steps are clear, but future steps are pale and show placeholder times. The summary card contains totals and assistance, but there is no dominant “what happens next” explanation near the active status.

**Impact**

A customer who is checking delivery status may still wonder whether the order is progressing normally or stalled.

**Recommendation**

- Add a short active-state explanation directly below the current step.
- Replace placeholder time values with “Pending” or “Estimated later today.”
- Use a stronger active connector and a subdued but legible future state.
- Add a clear delivery promise near the current status and retain the assistance action as secondary.
- On mobile, stack the summary after the active timeline and keep the current state visible above the fold.

**Success check**

The page answers: what has happened, what is happening now, and what the customer should expect next.

---

### P2-02 — Footer and page endings are over-spaced for task screens

**Affected screens/components**

- Product detail, checkout, and tracking screen endings.
- Source: route-level page padding plus `components/layout/SiteFooter.tsx`.

**Problem**

The supplied product, checkout, and tracking captures have large areas of unused cream space before the footer. This supports the editorial mood on the homepage but feels like a pause or unfinished layout on transactional pages.

**Impact**

Users have to scroll farther than necessary to reach supporting links, and the transactional pages feel less dense and purposeful than the purchase task requires.

**Recommendation**

- Use a dedicated transactional page spacing scale rather than reusing editorial `py-24` / `mb-32` rhythms.
- Let content height determine the page ending, with a smaller minimum bottom space after the final action.
- Keep generous spacing around the hero and editorial sections, but tighten the area after checkout, confirmation, and tracking content.

**Success check**

Task pages feel complete immediately after the final action or status content; editorial pages retain the larger breathing room.

---

### P2-03 — Responsive behavior needs explicit visual verification

**Affected screens/components**

- Header, collection toolbar/grid, PDP option pills, checkout two-column layout, tracking timeline/summary, footer.

**Problem**

The supplied captures are desktop-oriented, so mobile defects cannot be confirmed visually. The source does expose narrow-width risk areas: long header utility labels, filter controls, wrapping option pills, sticky summaries, and footer columns.

**Impact**

A layout that feels calm on desktop can become crowded, horizontally scrollable, or action-ambiguous on 320–390px screens. Arabic and French can amplify the problem through text expansion and RTL mirroring.

**Recommendation**

Validate these exact states:

- 320 × 568 and 390 × 844: homepage, shop, PDP, cart, checkout, tracking.
- 768 × 1024: shop, PDP, checkout.
- 1024px and 1280px widths: header wrapping and sticky toolbar geometry.
- English, French with long labels, and Arabic RTL.
- Default motion and reduced motion.
- Empty cart, validation errors, long product name, multi-recipient checkout, and pending tracking state.

Fail the review on horizontal overflow, clipped focus rings, hidden primary actions, or controls below a 44px target.

**Success check**

The same hierarchy survives width and language changes without requiring users to discover hidden functionality.

---

## Screen-by-screen recommendations

### Homepage

**Keep:** asymmetric hero, botanical photography, editorial feeling, strong rose CTA.

**Change:**

- Increase the scale/contrast of section labels such as “Featured gestures.”
- Add a clear carousel affordance and accessible label for horizontal featured content.
- Ensure featured product cards link to the actual product detail when they represent products; reserve collection links for occasion/editorial tiles.
- Tighten the gap between hero CTA and the next useful shopping action on smaller screens.
- Reduce footer micro-copy density and ensure its contrast is readable.

### Collection

**Keep:** strong collection heading, image-first cards, clear category/occasion grouping.

**Change:**

- Balance sparse result sets instead of forcing an asymmetrical orphan card.
- Make price, delivery, and product differentiator more legible.
- Use one compact mobile filter trigger and keep the sort control easy to reach.
- Avoid placing too many filter chips in a sticky region on narrow screens.

### Product detail

**Keep:** gallery-first layout, large product title, clear rose add-to-bag action, service reassurance row.

**Change:**

- Fix the mixed-language gift-note label visible in the supplied capture.
- Strengthen selected size/add-on states and price deltas.
- Increase metadata and service badge readability.
- Keep the CTA and wishlist control aligned as a single action row with a consistent 44–48px height.
- Make the gallery thumbnail state and image purpose clearer for keyboard/screen-reader users.

### Checkout

**Keep:** progress indicator, two-column summary, quick delivery-date choices, payment method grouping.

**Change:**

- Move the total and primary CTA into one stronger group.
- Increase label/helper text size and contrast.
- Reduce empty vertical space between form groups.
- Make selected date/payment states explicit with icon + tone, not only border/ribbon treatment.
- Add visible focus and error associations for every custom control.

### Tracking

**Keep:** timeline-first hierarchy, clear order number and delivery estimate, summary card with assistance path.

**Change:**

- Replace placeholder timestamps with meaningful pending language.
- Improve future-state contrast and active-state explanation.
- Keep the current delivery estimate visually adjacent to the active step.
- Provide a clearer next action for help or order changes.

---

## Recommended implementation order

### Sprint 1 — Protect conversion and accessibility

1. Fix the mixed-language PDP state and add locale-coherence tests.
2. Increase contrast/size for all essential metadata and pending statuses.
3. Rebuild checkout total + CTA as one visual group.
4. Add explicit focus, selected, and error states to custom controls.

### Sprint 2 — Improve browsing and system consistency

5. Balance sparse collection grids and strengthen comparison data.
6. Standardize radius, border, shadow, and selected-state tokens.
7. Simplify header utility hierarchy and verify sticky geometry.
8. Tighten transactional page endings without changing editorial spacing.

### Sprint 3 — Validate every responsive state

9. Add viewport, RTL, French, reduced-motion, overflow, and screenshot regression coverage.
10. Verify empty, loading, error, pending, and long-content states.

## Current-source note

Several implementation-level improvements are already present in the working tree — including a shared header-height token, a mobile filter Sheet, translated checkout keys, and improved form error associations. The supplied captures appear to predate at least some of these changes. Re-run the screenshots after the current code is rendered before treating a capture-only defect as still active.

## Final design principle

Do not make Rosette louder. Make its functional information clearer. Keep the cream, rose, botanical imagery, editorial type, and asymmetry; strengthen only the parts users must scan, compare, select, and trust.
