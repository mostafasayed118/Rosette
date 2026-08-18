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
insert into public.categories (id, slug, name_en, name_ar, name_fr)
values
  ('20000000-0000-4000-8000-000000000001', 'hand-bouquet',    'Hand bouquets',      'باقات يدوية',        'Bouquets main'),
  ('20000000-0000-4000-8000-000000000002', 'vase-arrangement','Vase arrangements', 'تنسيقات في مزهرية', 'Arrangements en vase'),
  ('20000000-0000-4000-8000-000000000003', 'plants',          'Plants',            'نباتات',            'Plantes'),
  ('20000000-0000-4000-8000-000000000004', 'gift-boxes',      'Gift boxes',        'صناديق هدايا',      'Coffrets cadeaux'),
  ('20000000-0000-4000-8000-000000000005', 'sympathy',        'Sympathy',          'واجب العزاء',       'Condoléances')
on conflict (id) do update
  set slug = excluded.slug,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      name_fr = excluded.name_fr;

-- Remove the occasion-style rows from the original minimal seed (they are not
-- product categories in the storefront).
delete from public.categories where slug in ('birthday', 'romance', 'thanks');

-- ---------------------------------------------------------------------------
-- Cities (must match features/destination/catalog.ts exactly)
-- ---------------------------------------------------------------------------
insert into public.cities (id, code, name_en, name_ar, name_fr, same_day)
values
  ('30000000-0000-4000-8000-000000000001', 'greater-cairo', 'Greater Cairo', 'القاهرة الكبرى', 'Le Grand Caire', true),
  ('30000000-0000-4000-8000-000000000002', 'alexandria',    'Alexandria',    'الإسكندرية',     'Alexandrie',     true),
  ('30000000-0000-4000-8000-000000000003', 'mansoura',      'Mansoura',      'المنصورة',       'Mansourah',      false),
  ('30000000-0000-4000-8000-000000000004', 'zagazig',       'Zagazig',       'الزقازيق',       'Zagazig',        false),
  ('30000000-0000-4000-8000-000000000005', 'tanta',         'Tanta',         'طنطا',           'Tanta',          false),
  ('30000000-0000-4000-8000-000000000006', 'menofya',       'Menofya',       'المنوفية',       'Menoufia',       false),
  ('30000000-0000-4000-8000-000000000007', 'north-coast',   'North Coast',   'الساحل الشمالي', 'Côte Nord',      false),
  ('30000000-0000-4000-8000-000000000008', 'ain-sokhna',    'Ain Sokhna',    'العين السخنة',   'Aïn Sokhna',     false),
  ('30000000-0000-4000-8000-000000000009', 'ismailia',      'Ismailia',      'الإسماعيلية',    'Ismaïlia',       false),
  ('30000000-0000-4000-8000-000000000010', 'banha',         'Banha',         'بنها',           'Benha',          false),
  ('30000000-0000-4000-8000-000000000011', 'suez',          'Suez',          'السويس',         'Suez',           false)
on conflict (id) do update
  set code = excluded.code,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      name_fr = excluded.name_fr,
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
insert into public.products (id, slug, name_en, name_ar, name_fr, description_en, description_ar, description_fr, category, occasions, price_minor, tone, image_url, delivery, add_ons, created_at)
values
  ('00000000-0000-4000-8000-000000000001', 'rose-hour', 'Rose Hour', 'ساعة الورد', 'L’Heure des Roses',
   'Soft garden roses in a hand-tied bouquet, wrapped the way a quiet message deserves.',
   'ورود حدائق ناعمة في باقة يدوية بتغليف يليق برسالة لا تحتاج كلمات.',
   'Des roses de jardin douces en bouquet noué main, emballées comme le mérite un message discret.',
   'hand-bouquet', array['birthday','love'], 12000, '#bc6d63',
   NULL,
   'Same-day in Greater Cairo and Alexandria',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500},{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","name_fr":"Chocolat noir","price_minor":1800}]'::jsonb,
   '2026-01-02T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000002', 'green-morning', 'Green Morning', 'صباح أخضر', 'Matin Vert',
   'A leafy vase arrangement with the calm of a window left open.',
   'تنسيق أخضر في مزهرية يحمل هدوء نافذة مفتوحة.',
   'Un arrangement feuillu en vase, avec le calme d’une fenêtre laissée ouverte.',
   'vase-arrangement', ARRAY['thank-you','new-home'], 18000, '#6f8b73',
   NULL,
   'Next-day delivery',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500}]'::jsonb,
   '2026-03-02T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000003', 'sunlit-stems', 'Sunlit Stems', 'سيقان مضيئة', 'Tiges Ensoleillées',
   'Golden stems with a little movement, gathered for a bright day.',
   'سيقان ذهبية مليئة بالحيوية، جمعت ليوم مشرق.',
   'Des tiges dorées pleines de mouvement, cueillies pour une journée lumineuse.',
   'hand-bouquet', ARRAY['birthday','congratulations'], 14500, '#d6b56d',
   NULL,
   'Same-day in Greater Cairo and Alexandria',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500},{"id":"balloon","name_en":"Celebration balloon","name_ar":"بالون احتفالي","name_fr":"Ballon de fête","price_minor":1200}]'::jsonb,
   '2026-02-14T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000004', 'terracotta-love', 'Terracotta Love', 'حب بلون الطين', 'Amour Terracotta',
   'Warm ranunculus with a sculptural wrap — a gesture from the heart.',
   'أزهار رانانكيولوس دافئة بتغليف نحتي، مبادرة من القلب.',
   'Des renoncules chaleureuses dans un emballage sculptural — un geste venu du cœur.',
   'hand-bouquet', ARRAY['love'], 22000, '#d19a82',
   NULL,
   'Next-day delivery',
   '[{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","name_fr":"Chocolat noir","price_minor":1800}]'::jsonb,
   '2026-02-01T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000005', 'quiet-orchid', 'Quiet Orchid', 'أوركيد هادئ', 'Orchidée Sereine',
   'An elegant orchid plant that keeps the sentiment alive for months.',
   'نبتة أوركيد أنيقة تُطيل بقاء الشعور حياً لأشهر.',
   'Une orchidée élégante qui garde le sentiment vivant pendant des mois.',
   'plants', ARRAY['new-home','thank-you'], 26000, '#b7a8c7',
   NULL,
   'Next-day delivery',
   '[]'::jsonb,
   '2026-01-20T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000006', 'wild-meadow', 'Wild Meadow', 'مرج بري', 'Prairie Sauvage',
   'Loose seasonal color, as if gathered on a morning walk.',
   'ألوان موسمية حرة، كأنها جُمعت في نزهة صباحية.',
   'Des couleurs de saison libres, comme cueillies lors d’une promenade matinale.',
   'vase-arrangement', ARRAY['congratulations'], 19500, '#9aaf83',
   NULL,
   'Next-day delivery',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500}]'::jsonb,
   '2026-03-10T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000007', 'little-thanks', 'Little Thanks', 'شكر صغير', 'Petit Merci',
   'A petite posy for the people who make our days brighter.',
   'باقة صغيرة لمن يجعلون أيامنا أجمل.',
   'Un petit bouquet pour ceux qui illuminent nos journées.',
   'hand-bouquet', ARRAY['thank-you'], 8500, '#e2b5a6',
   NULL,
   'Same-day in Greater Cairo and Alexandria',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500}]'::jsonb,
   '2026-01-09T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000008', 'citrus-cloud', 'Citrus Cloud', 'سحابة حمضية', 'Nuage d’Agrumes',
   'A light, fragrant arrangement with a zesty touch.',
   'تنسيق خفيف وعطِر بلمسة حمضية منعشة.',
   'Un arrangement léger et parfumé, avec une touche d’agrumes.',
   'vase-arrangement', ARRAY['birthday'], 16000, '#e4c57b',
   NULL,
   'Next-day delivery',
   '[]'::jsonb,
   '2026-02-28T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000009', 'midnight-roses', 'Midnight Roses', 'ورد منتصف الليل', 'Roses de Minuit',
   'Deep wine-red roses on tall stems — dramatic and unforgettable.',
   'ورود حمراء داكنة على سيقان طويلة — فخامة لا تُنسى.',
   'Des roses rouge vin profond sur de longues tiges — dramatiques et inoubliables.',
   'hand-bouquet', ARRAY['love','congratulations'], 24000, '#6b2d3f',
   NULL,
   'Same-day in Greater Cairo and Alexandria',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500},{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","name_fr":"Chocolat noir","price_minor":1800}]'::jsonb,
   '2026-04-08T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000010', 'sakura-breath', 'Breath of Sakura', 'نَفَس الساكورا', 'Souffle de Sakura',
   'Pale pink blossoms arranged like a spring breeze in a vase.',
   'أزهار وردية فاتحة كنسيم الربيع، منسقة في مزهرية.',
   'De pâles fleurs roses arrangées comme une brise de printemps dans un vase.',
   'vase-arrangement', ARRAY['birthday','thank-you'], 21000, '#e8b4c8',
   NULL,
   'Same-day in Greater Cairo and Alexandria',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500}]'::jsonb,
   '2026-06-15T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000011', 'white-lotus', 'White Lotus', 'لوتس أبيض', 'Lotus Blanc',
   'A calm white lotus arrangement — serenity for a new beginning.',
   'تنسيق لوتس أبيض هادئ — سكينة لبداية جديدة.',
   'Un arrangement de lotus blanc apaisant — la sérénité pour un nouveau départ.',
   'plants', ARRAY['new-home','thank-you'], 28000, '#e7e0d3',
   NULL,
   'Next-day delivery',
   '[]'::jsonb,
   '2026-04-21T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000012', 'petal-box', 'Petal Box', 'علبة البتلات', 'Coffret de Pétales',
   'A tidy box of loose petals and stems — the modern way to say it.',
   'علبة أنيقة من البتلات والزهور — الطريقة العصرية لتقولها.',
   'Un coffret soigné de pétales et de fleurs détachées — la façon moderne de le dire.',
   'gift-boxes', ARRAY['love','birthday'], 19000, '#c96f8a',
   NULL,
   'Same-day in Greater Cairo and Alexandria',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500},{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","name_fr":"Chocolat noir","price_minor":1800}]'::jsonb,
   '2026-05-12T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000013', 'roses-in-a-box', 'Roses in a Box', 'ورد في علبة', 'Roses en Coffret',
   'A dozen long-stemmed roses in a keepsake box, door to door.',
   'دستة ورود طويلة الساق في علبة تذكارية تصل إلى الباب.',
   'Une douzaine de roses à longues tiges dans un coffret souvenir, livrées à votre porte.',
   'gift-boxes', ARRAY['love'], 26000, '#b23a48',
   NULL,
   'Same-day in Greater Cairo and Alexandria',
   '[{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","name_fr":"Chocolat noir","price_minor":1800},{"id":"balloon","name_en":"Celebration balloon","name_ar":"بالون احتفالي","name_fr":"Ballon de fête","price_minor":1200}]'::jsonb,
   '2026-06-01T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000014', 'white-serenade', 'White Serenade', 'سيريناد أبيض', 'Sérénade Blanche',
   'A quiet arrangement of white blooms for a moment of respect.',
   'تنسيق هادئ من الأزهار البيضاء لحظة من الاحترام والسكينة.',
   'Un arrangement discret de fleurs blanches pour un moment de respect.',
   'sympathy', ARRAY['sympathy'], 20000, '#e8e4e1',
   NULL,
   'Next-day delivery',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500}]'::jsonb,
   '2026-05-20T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000015', 'quiet-remembrance', 'Quiet Remembrance', 'ذكرى هادئة', 'Souvenir Discret',
   'A calm green plant that keeps a memory growing.',
   'نبتة خضراء هادئة تُبقي الذكرى مستمرة بأبسط صورة.',
   'Une plante verte apaisante qui fait grandir un souvenir.',
   'sympathy', ARRAY['sympathy'], 28000, '#c9c3cf',
   NULL,
   'Next-day delivery',
   '[]'::jsonb,
   '2026-05-20T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000016', 'grand-roses', 'Grand Roses', 'ورود فاخرة', 'Roses Grandioses',
   'A generous hand-tied armful of long roses, nothing held back.',
   'باقة يدوية سخية من الورود الطويلة، بلا حدود ولا تحفظ.',
   'Une brassée généreuse de roses à longues tiges, nouée main, sans retenue.',
   'hand-bouquet', ARRAY['love','congratulations'], 32000, '#c2185b',
   NULL,
   'Same-day in Greater Cairo and Alexandria',
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500},{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","name_fr":"Chocolat noir","price_minor":1800}]'::jsonb,
   '2026-07-01T09:00:00Z')
on conflict (id) do update
  set slug = excluded.slug,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      name_fr = excluded.name_fr,
      description_en = excluded.description_en,
      description_ar = excluded.description_ar,
      description_fr = excluded.description_fr,
      category = excluded.category,
      occasions = excluded.occasions,
      price_minor = excluded.price_minor,
      tone = excluded.tone,
      delivery = excluded.delivery,
      add_ons = excluded.add_ons;

-- ---------------------------------------------------------------------------
-- Variants (every product has at least one so it can be ordered)
-- ---------------------------------------------------------------------------
insert into public.product_variants (id, product_id, name_en, name_ar, name_fr, price_delta_minor)
values
  -- rose-hour
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Classic', 'كلاسيكي', 'Classique', 0),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Generous', 'سخي', 'Généreux', 4500),
  -- green-morning
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Single', 'مزهرية فردية', 'Vase simple', 0),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'Double', 'مزهرية مزدوجة', 'Vase double', 7000),
  -- sunlit-stems
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003', 'Classic', 'كلاسيكي', 'Classique', 0),
  -- terracotta-love
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000004', 'Classic', 'كلاسيكي', 'Classique', 0),
  -- quiet-orchid
  ('10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000005', 'Small', 'صغير', 'Petit', 0),
  ('10000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000005', 'Large', 'كبير', 'Grand', 8000),
  -- wild-meadow
  ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000006', 'Single', 'مزهرية فردية', 'Vase simple', 0),
  -- little-thanks
  ('10000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000007', 'Classic', 'كلاسيكي', 'Classique', 0),
  -- citrus-cloud
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000008', 'Single', 'مزهرية فردية', 'Vase simple', 0),
  -- midnight-roses
  ('10000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000009', 'Classic', 'كلاسيكي', 'Classique', 0),
  ('10000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000009', 'Generous', 'سخي', 'Généreux', 5000),
  -- sakura-breath
  ('10000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000010', 'Single', 'مزهرية فردية', 'Vase simple', 0),
  ('10000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000010', 'Double', 'مزهرية مزدوجة', 'Vase double', 6000),
  -- white-lotus
  ('10000000-0000-4000-8000-000000000016', '00000000-0000-4000-8000-000000000011', 'Small', 'صغير', 'Petit', 0),
  ('10000000-0000-4000-8000-000000000017', '00000000-0000-4000-8000-000000000011', 'Large', 'كبير', 'Grand', 7000),
  -- petal-box
  ('10000000-0000-4000-8000-000000000018', '00000000-0000-4000-8000-000000000012', 'Classic', 'كلاسيكي', 'Classique', 0),
  ('10000000-0000-4000-8000-000000000019', '00000000-0000-4000-8000-000000000012', 'Generous', 'سخي', 'Généreux', 5000),
  -- roses-in-a-box
  ('10000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000013', 'Classic', 'كلاسيكي', 'Classique', 0),
  ('10000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000013', 'Generous', 'سخي', 'Généreux', 6000),
  -- white-serenade
  ('10000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000014', 'Single', 'مزهرية فردية', 'Vase simple', 0),
  -- quiet-remembrance
  ('10000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000015', 'Small', 'صغير', 'Petit', 0),
  ('10000000-0000-4000-8000-000000000024', '00000000-0000-4000-8000-000000000015', 'Large', 'كبير', 'Grand', 7000),
  -- grand-roses
  ('10000000-0000-4000-8000-000000000025', '00000000-0000-4000-8000-000000000016', 'Classic', 'كلاسيكي', 'Classique', 0),
  ('10000000-0000-4000-8000-000000000026', '00000000-0000-4000-8000-000000000016', 'Generous', 'سخي', 'Généreux', 6000)
on conflict (id) do update
  set product_id = excluded.product_id,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      name_fr = excluded.name_fr,
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
  ('10000000-0000-4000-8000-000000000017', 1),
  ('10000000-0000-4000-8000-000000000018', 10),
  ('10000000-0000-4000-8000-000000000019', 4),
  ('10000000-0000-4000-8000-000000000020', 5),
  ('10000000-0000-4000-8000-000000000021', 3),
  ('10000000-0000-4000-8000-000000000022', 4),
  ('10000000-0000-4000-8000-000000000023', 2),
  ('10000000-0000-4000-8000-000000000024', 1),
  ('10000000-0000-4000-8000-000000000025', 5),
  ('10000000-0000-4000-8000-000000000026', 3)
on conflict (variant_id) do update
  set quantity = excluded.quantity,
      reserved_quantity = least(inventory.reserved_quantity, excluded.quantity);

-- ---------------------------------------------------------------------------
-- Done. Run supabase/migrations/001_commerce.sql first.
-- ---------------------------------------------------------------------------