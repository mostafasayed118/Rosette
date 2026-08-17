-- ============================================================================
-- Rosette storefront — seed data (idempotent)
-- ============================================================================
-- All monetary values are in minor units (piasters): 12000 == 120.00 EGP.
-- Every row uses a fixed id with `on conflict ... do update`, so the script
-- can be re-run safely in the Supabase SQL editor at any time.
--
-- City codes mirror features/destination/data.ts (the checkout form) so
-- `orders.delivery_city_code` always satisfies its foreign key.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Categories (values match `products.category` and the storefront filter)
-- ---------------------------------------------------------------------------
insert into public.categories (id, slug, name_en, name_ar)
values
  ('20000000-0000-4000-8000-000000000001', 'hand-bouquet',    'Hand bouquets',      'باقات يدوية'),
  ('20000000-0000-4000-8000-000000000002', 'vase-arrangement','Vase arrangements', 'تنسيقات في مزهرية'),
  ('20000000-0000-4000-8000-000000000003', 'plants',          'Plants',            'نباتات')
on conflict (id) do update
  set slug = excluded.slug,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar;

-- Remove the occasion-style rows from the original minimal seed (they are not
-- product categories in the storefront).
delete from public.categories where slug in ('birthday', 'romance', 'thanks');

-- ---------------------------------------------------------------------------
-- Cities (must match features/destination/catalog.ts exactly)
-- ---------------------------------------------------------------------------
insert into public.cities (id, code, name_en, name_ar, same_day)
values
  ('30000000-0000-4000-8000-000000000001', 'greater-cairo', 'Greater Cairo', 'القاهرة الكبرى', true),
  ('30000000-0000-4000-8000-000000000002', 'alexandria',    'Alexandria',    'الإسكندرية',     true),
  ('30000000-0000-4000-8000-000000000003', 'mansoura',      'Mansoura',      'المنصورة',       false),
  ('30000000-0000-4000-8000-000000000004', 'zagazig',       'Zagazig',       'الزقازيق',       false),
  ('30000000-0000-4000-8000-000000000005', 'tanta',         'Tanta',         'طنطا',           false),
  ('30000000-0000-4000-8000-000000000006', 'menofya',       'Menofya',       'المنوفية',       false),
  ('30000000-0000-4000-8000-000000000007', 'north-coast',   'North Coast',   'الساحل الشمالي', false),
  ('30000000-0000-4000-8000-000000000008', 'ain-sokhna',    'Ain Sokhna',    'العين السخنة',   false),
  ('30000000-0000-4000-8000-000000000009', 'ismailia',      'Ismailia',      'الإسماعيلية',    false),
  ('30000000-0000-4000-8000-000000000010', 'banha',         'Banha',         'بنها',           false),
  ('30000000-0000-4000-8000-000000000011', 'suez',          'Suez',          'السويس',         false)
on conflict (id) do update
  set code = excluded.code,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      same_day = excluded.same_day;

-- Drop the old seed's city codes so they cannot linger next to the new ones.
delete from public.delivery_rules where city_code in ('cairo', 'giza');
delete from public.cities where code in ('cairo', 'giza');

-- ---------------------------------------------------------------------------
-- Delivery rules (fee in piasters; cutoff_hour = latest same-day order hour)
-- ---------------------------------------------------------------------------
insert into public.delivery_rules (id, city_code, fee_minor, minimum_order_minor, cutoff_hour)
values
  ('40000000-0000-4000-8000-000000000001', 'greater-cairo', 7500,  0, 14),
  ('40000000-0000-4000-8000-000000000002', 'alexandria',    7500,  0, 13),
  ('40000000-0000-4000-8000-000000000003', 'mansoura',     10000,  0, 15),
  ('40000000-0000-4000-8000-000000000004', 'zagazig',       9500,  0, 15),
  ('40000000-0000-4000-8000-000000000005', 'tanta',        10000,  0, 15),
  ('40000000-0000-4000-8000-000000000006', 'menofya',      10000,  0, 15),
  ('40000000-0000-4000-8000-000000000007', 'north-coast',  17500,  0, 11),
  ('40000000-0000-4000-8000-000000000008', 'ain-sokhna',   17500,  0, 11),
  ('40000000-0000-4000-8000-000000000009', 'ismailia',      9000,  0, 14),
  ('40000000-0000-4000-8000-000000000010', 'banha',         8500,  0, 15),
  ('40000000-0000-4000-8000-000000000011', 'suez',          9500,  0, 14)
on conflict (id) do update
  set city_code = excluded.city_code,
      fee_minor = excluded.fee_minor,
      minimum_order_minor = excluded.minimum_order_minor,
      cutoff_hour = excluded.cutoff_hour;

-- ---------------------------------------------------------------------------
-- Products (tone = hex visual color; add_ons ids match CartAddOn ids)
-- ---------------------------------------------------------------------------
insert into public.products (id, slug, name_en, name_ar, description_en, description_ar, category, occasions, price_minor, tone, delivery, add_ons, created_at)
values
  ('00000000-0000-4000-8000-000000000001', 'rose-hour', 'Rose Hour', 'ساعة الورد',
   'Soft garden roses in a hand-tied bouquet, wrapped the way a quiet message deserves.',
   'ورود حدائق ناعمة في باقة يدوية بتغليف يليق برسالة لا تحتاج كلمات.',
   'hand-bouquet', array['birthday','love'], 12000, '#bc6d63',
   'Same-day in Greater Cairo and Alexandria',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","price_minor":500},{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","price_minor":1800}]'::jsonb,
   '2026-01-02T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000002', 'green-morning', 'Green Morning', 'صباح أخضر',
   'A leafy vase arrangement with the calm of a window left open.',
   'تنسيق أخضر في مزهرية يحمل هدوء نافذة مفتوحة.',
   'vase-arrangement', ARRAY['thank-you','new-home'], 18000, '#6f8b73',
   'Next-day delivery',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","price_minor":500}]'::jsonb,
   '2026-03-02T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000003', 'sunlit-stems', 'Sunlit Stems', 'سيقان مضيئة',
   'Golden stems with a little movement, gathered for a bright day.',
   'سيقان ذهبية مليئة بالحيوية، جمعت ليوم مشرق.',
   'hand-bouquet', ARRAY['birthday','congratulations'], 14500, '#d6b56d',
   'Same-day in Greater Cairo and Alexandria',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","price_minor":500},{"id":"balloon","name_en":"Celebration balloon","name_ar":"بالون احتفالي","price_minor":1200}]'::jsonb,
   '2026-02-14T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000004', 'terracotta-love', 'Terracotta Love', 'حب بلون الطين',
   'Warm ranunculus with a sculptural wrap — a gesture from the heart.',
   'أزهار رانانكيولوس دافئة بتغليف نحتي، مبادرة من القلب.',
   'hand-bouquet', ARRAY['love'], 22000, '#d19a82',
   'Next-day delivery',
   '[{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","price_minor":1800}]'::jsonb,
   '2026-02-01T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000005', 'quiet-orchid', 'Quiet Orchid', 'أوركيد هادئ',
   'An elegant orchid plant that keeps the sentiment alive for months.',
   'نبتة أوركيد أنيقة تُطيل بقاء الشعور حياً لأشهر.',
   'plants', ARRAY['new-home','thank-you'], 26000, '#b7a8c7',
   'Next-day delivery',
   '[]'::jsonb,
   '2026-01-20T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000006', 'wild-meadow', 'Wild Meadow', 'مرج بري',
   'Loose seasonal color, as if gathered on a morning walk.',
   'ألوان موسمية حرة، كأنها جُمعت في نزهة صباحية.',
   'vase-arrangement', ARRAY['congratulations'], 19500, '#9aaf83',
   'Next-day delivery',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","price_minor":500}]'::jsonb,
   '2026-03-10T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000007', 'little-thanks', 'Little Thanks', 'شكر صغير',
   'A petite posy for the people who make our days brighter.',
   'باقة صغيرة لمن يجعلون أيامنا أجمل.',
   'hand-bouquet', ARRAY['thank-you'], 8500, '#e2b5a6',
   'Same-day in Greater Cairo and Alexandria',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","price_minor":500}]'::jsonb,
   '2026-01-09T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000008', 'citrus-cloud', 'Citrus Cloud', 'سحابة حمضية',
   'A light, fragrant arrangement with a zesty touch.',
   'تنسيق خفيف وعطِر بلمسة حمضية منعشة.',
   'vase-arrangement', ARRAY['birthday'], 16000, '#e4c57b',
   'Next-day delivery',
   '[]'::jsonb,
   '2026-02-28T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000009', 'midnight-roses', 'Midnight Roses', 'ورد منتصف الليل',
   'Deep wine-red roses on tall stems — dramatic and unforgettable.',
   'ورود حمراء داكنة على سيقان طويلة — فخامة لا تُنسى.',
   'hand-bouquet', ARRAY['love','congratulations'], 24000, '#6b2d3f',
   'Same-day in Greater Cairo and Alexandria',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","price_minor":500},{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","price_minor":1800}]'::jsonb,
   '2026-04-08T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000010', 'sakura-breath', 'Breath of Sakura', 'نَفَس الساكورا',
   'Pale pink blossoms arranged like a spring breeze in a vase.',
   'أزهار وردية فاتحة كنسيم الربيع، منسقة في مزهرية.',
   'vase-arrangement', ARRAY['birthday','thank-you'], 21000, '#e8b4c8',
   'Same-day in Greater Cairo and Alexandria',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","price_minor":500}]'::jsonb,
   '2026-06-15T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000011', 'white-lotus', 'White Lotus', 'لوتس أبيض',
   'A calm white lotus arrangement — serenity for a new beginning.',
   'تنسيق لوتس أبيض هادئ — سكينة لبداية جديدة.',
   'plants', ARRAY['new-home','thank-you'], 28000, '#e7e0d3',
   'Next-day delivery',
   '[]'::jsonb,
   '2026-04-21T09:00:00Z')
on conflict (id) do update
  set slug = excluded.slug,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      description_en = excluded.description_en,
      description_ar = excluded.description_ar,
      category = excluded.category,
      occasions = excluded.occasions,
      price_minor = excluded.price_minor,
      tone = excluded.tone,
      delivery = excluded.delivery,
      add_ons = excluded.add_ons;

-- ---------------------------------------------------------------------------
-- Variants (every product has at least one so it can be ordered)
-- ---------------------------------------------------------------------------
insert into public.product_variants (id, product_id, name_en, name_ar, price_delta_minor)
values
  -- rose-hour
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Classic', 'كلاسيكي', 0),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Generous', 'سخي', 4500),
  -- green-morning
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Single', 'مزهرية فردية', 0),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'Double', 'مزهرية مزدوجة', 7000),
  -- sunlit-stems
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003', 'Classic', 'كلاسيكي', 0),
  -- terracotta-love
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000004', 'Classic', 'كلاسيكي', 0),
  -- quiet-orchid
  ('10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000005', 'Small', 'صغير', 0),
  ('10000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000005', 'Large', 'كبير', 8000),
  -- wild-meadow
  ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000006', 'Single', 'مزهرية فردية', 0),
  -- little-thanks
  ('10000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000007', 'Classic', 'كلاسيكي', 0),
  -- citrus-cloud
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000008', 'Single', 'مزهرية فردية', 0),
  -- midnight-roses
  ('10000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000009', 'Classic', 'كلاسيكي', 0),
  ('10000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000009', 'Generous', 'سخي', 5000),
  -- sakura-breath
  ('10000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000010', 'Single', 'مزهرية فردية', 0),
  ('10000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000010', 'Double', 'مزهرية مزدوجة', 6000),
  -- white-lotus
  ('10000000-0000-4000-8000-000000000016', '00000000-0000-4000-8000-000000000011', 'Small', 'صغير', 0),
  ('10000000-0000-4000-8000-000000000017', '00000000-0000-4000-8000-000000000011', 'Large', 'كبير', 7000)
on conflict (id) do update
  set product_id = excluded.product_id,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      price_delta_minor = excluded.price_delta_minor;

-- ---------------------------------------------------------------------------
-- Inventory (available = quantity - reserved_quantity)
-- ---------------------------------------------------------------------------
insert into public.inventory (variant_id, quantity)
values
  ('10000000-0000-4000-8000-000000000001', 5),
  ('10000000-0000-4000-8000-000000000002', 3),
  ('10000000-0000-4000-8000-000000000003', 2),
  ('10000000-0000-4000-8000-000000000004', 2),
  ('10000000-0000-4000-8000-000000000005', 7),
  ('10000000-0000-4000-8000-000000000006', 3),
  ('10000000-0000-4000-8000-000000000007', 1),
  ('10000000-0000-4000-8000-000000000008', 1),
  ('10000000-0000-4000-8000-000000000009', 6),
  ('10000000-0000-4000-8000-000000000010', 10),
  ('10000000-0000-4000-8000-000000000011', 5),
  ('10000000-0000-4000-8000-000000000012', 6),
  ('10000000-0000-4000-8000-000000000013', 3),
  ('10000000-0000-4000-8000-000000000014', 4),
  ('10000000-0000-4000-8000-000000000015', 3),
  ('10000000-0000-4000-8000-000000000016', 2),
  ('10000000-0000-4000-8000-000000000017', 1)
on conflict (variant_id) do update
  set quantity = excluded.quantity,
      reserved_quantity = least(inventory.reserved_quantity, excluded.quantity);

-- ---------------------------------------------------------------------------
-- Done. Run supabase/migrations/001_commerce.sql first.
-- ---------------------------------------------------------------------------