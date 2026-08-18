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
-- Blog authors (authors, migration 007)
-- ---------------------------------------------------------------------------
insert into public.authors (id, slug, name_en, name_ar, name_fr, role_en, role_ar, role_fr, bio_en, bio_ar, bio_fr)
values
  (
    'a0000000-0000-4000-8000-000000000001', 'nour-hassan',
    'Nour Hassan', 'نور حسن', 'Nour Hassan',
    'Founder & head florist', 'المؤسِّسة ورئيسة الزهور', 'Fondatrice et fleuriste en chef',
    'Nour founded Rosette after a decade behind the florist’s bench in Cairo, sourcing stems from local farms and tying every bouquet by hand.',
    'أسّست نور روزيت بعد عقد خلف طاولة بائع الزهور في القاهرة، وهي تختار الأزهار من المزارع المحلية وتربط كل باقة يدوياً.',
    'Nour a fondé Rosette après une décennie derrière l’établi de fleuriste au Caire, choisissant les fleurs auprès de fermes locales et nouant chaque bouquet à la main.'
  ),
  (
    'a0000000-0000-4000-8000-000000000002', 'rosette-studio',
    'The Rosette Studio', 'استوديو روزيت', 'Le Studio Rosette',
    'The Rosette team', 'فريق روزيت', 'L’équipe Rosette',
    'The people behind the bouquets — growers, couriers, and the studio hands who make same-day delivery happen across Egypt.',
    'الأشخاص الذين يقفون خلف الباقات — المزارعون وسائقو التوصيل وأيدي الاستوديو الذين يجعلون التوصيل في نفس اليوم ممكناً في جميع أنحاء مصر.',
    'Les personnes derrière les bouquets — producteurs, coursiers et les mains du studio qui rendent possible la livraison le jour même partout en Égypte.'
  )
on conflict (id) do update
  set slug = excluded.slug,
      name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      name_fr = excluded.name_fr,
      role_en = excluded.role_en,
      role_ar = excluded.role_ar,
      role_fr = excluded.role_fr,
      bio_en = excluded.bio_en,
      bio_ar = excluded.bio_ar,
      bio_fr = excluded.bio_fr,
      avatar_url = excluded.avatar_url;

-- ---------------------------------------------------------------------------
-- Blog posts & per-city landing pages (blog_posts, migration 006)
-- ---------------------------------------------------------------------------
insert into public.blog_posts (id, slug, type, city_code, author_id, title_en, title_ar, title_fr, excerpt_en, excerpt_ar, excerpt_fr, content_en, content_ar, content_fr, category, published, published_at)
values
  (
    '90000000-0000-4000-8000-000000000001', 'how-flower-delivery-works', 'post', null, 'a0000000-0000-4000-8000-000000000001',
    'How flower delivery works in Egypt', 'كيف تعمل خدمة توصيل الزهور في مصر', 'Comment fonctionne la livraison de fleurs en Égypte',
    'Same-day windows, city coverage, and what to expect when your bouquet arrives.', 'نوافذ التوصيل في نفس اليوم، تغطية المدن، وما يمكن توقعه عند وصول باقتك.', 'Fenêtres de livraison le jour même, couverture des villes et à quoi vous attendre.',
    '<p>Ordering flowers online in Egypt is simpler than it looks. Pick your city, choose a delivery date and window, and we handle the rest.</p><h2>Same-day delivery</h2><p>Greater Cairo and Alexandria offer same-day delivery when you order before the afternoon cutoff. Other cities are served next day.</p><h2>What to expect</h2><p>Every bouquet arrives wrapped and ready to gift, with your message card included. The sender’s details stay private.</p>',
    '<p>طلب الزهور أونلاين في مصر أسهل مما يبدو. اختر مدينتك، وحدد تاريخ ووقت التوصيل، ونحن نتولى الباقي.</p><h2>توصيل نفس اليوم</h2><p>القاهرة الكبرى والإسكندرية توفران توصيل نفس اليوم عند الطلب قبل موعد القطع بعد الظهر. باقي المدن تُخدم في اليوم التالي.</p><h2>ما يمكن توقعه</h2><p>كل باقة تصل مغلفة وجاهزة للإهداء، مع بطاقة رسالتك. تظل بيانات المرسل خاصة.</p>',
    '<p>Commander des fleurs en ligne en Égypte est plus simple qu’il n’y paraît. Choisissez votre ville, une date et un créneau de livraison, et nous nous occupons du reste.</p><h2>Livraison le jour même</h2><p>Le Grand Caire et Alexandrie offrent la livraison le jour même avant la limite de l’après-midi. Les autres villes sont livrées le lendemain.</p><h2>À quoi vous attendre</h2><p>Chaque bouquet arrive emballé et prêt à offrir, avec votre carte de message. Les coordonnées de l’expéditeur restent privées.</p>',
    'guides', true, now() - interval '10 days'
  ),
  (
    '90000000-0000-4000-8000-000000000002', 'keep-roses-fresh', 'post', null, 'a0000000-0000-4000-8000-000000000001',
    '5 tips for keeping roses fresh longer', '5 نصائح لإبقاء الورد طازجاً لفترة أطول', '5 conseils pour garder vos roses fraîches',
    'Cut stems, fresh water, cool corners: the small habits that extend a bouquet’s life.', 'قص السيقان، ماء نظيف، زاوية باردة: عادات صغيرة تطيل عمر الباقة.', 'Tige coupée, eau fraîche, coin frais : les petites habitudes qui prolongent la vie d’un bouquet.',
    '<p>Fresh roses can easily last a week with a little care.</p><ul><li>Trim the stems at an angle every two days.</li><li>Change the water and rinse the vase.</li><li>Keep the bouquet away from direct sun and fruit bowls.</li></ul>',
    '<p>يمكن للورد الطازج أن يعيش أسبوعاً بسهولة مع قليل من العناية.</p><ul><li>قص السيقان بزاوية كل يومين.</li><li>غيّر الماء واغسل المزهرية.</li><li>أبعد الباقة عن الشمس المباشرة ووعاء الفاكهة.</li></ul>',
    '<p>Les roses fraîches peuvent facilement durer une semaine avec un peu de soin.</p><ul><li>Coupez les tiges en biais tous les deux jours.</li><li>Changez l’eau et rincez le vase.</li><li>Gardez le bouquet loin du soleil direct et des fruits.</li></ul>',
    'care', true, now() - interval '6 days'
  ),
  (
    '90000000-0000-4000-8000-000000000003', 'sympathy-flowers-etiquette', 'post', null, 'a0000000-0000-4000-8000-000000000002',
    'Sympathy flowers: etiquette and timing', 'زهور التعازي: الآداب والتوقيت', 'Fleurs de condoléances : étiquette et timing',
    'When to send, what to choose, and how to word the card for moments of loss.', 'متى ترسل، وماذا تختار، وكيف تصوغ البطاقة في لحظات الفقد.', 'Quand envoyer, que choisir et comment rédiger la carte dans les moments de deuil.',
    '<p>White and soft-hued arrangements are the classic choice for sympathy. Send as soon as you learn the news; a thoughtful message matters more than length.</p>',
    '<p>الترتيبات البيضاء والهادئة هي الخيار الكلاسيكي للتعازي. أرسل فور معرفتك بالخبر؛ الرسالة المدروسة أهم من طولها.</p>',
    '<p>Les compositions blanches et douces sont le choix classique pour les condoléances. Envoyez dès que vous apprenez la nouvelle ; un message attentionné compte plus que sa longueur.</p>',
    'occasions', true, now() - interval '2 days'
  ),
  (
    '90000000-0000-4000-8000-000000000004', 'same-day-flower-delivery-cairo', 'city', 'greater-cairo', 'a0000000-0000-4000-8000-000000000002',
    'Same-day flower delivery in Cairo', 'توصيل زهور في نفس اليوم في القاهرة', 'Livraison de fleurs le jour même au Caire',
    'Fresh bouquets delivered across Greater Cairo the same day you order.', 'باقات طازجة تُوصَّل في جميع أنحاء القاهرة الكبرى في نفس يوم الطلب.', 'Bouquets frais livrés dans tout le Grand Caire le jour même de la commande.',
    '<p>Greater Cairo is our flagship same-day city. Order before the afternoon cutoff and your bouquet arrives in a chosen window, wrapped and ready.</p><p>We deliver to Cairo, Giza, and the surrounding districts every day except Friday.</p>',
    '<p>القاهرة الكبرى هي مدينتنا الرئيسية للتوصيل في نفس اليوم. اطلب قبل موعد القطع بعد الظهر وستصل باقتك في الوقت الذي اخترته، مغلفة وجاهزة.</p><p>نوصل إلى القاهرة والجيزة والمناطق المحيطة كل يوم ما عدا الجمعة.</p>',
    '<p>Le Grand Caire est notre ville phare pour la livraison le jour même. Commandez avant la limite de l’après-midi et votre bouquet arrive dans le créneau choisi, emballé et prêt.</p><p>Nous livrons au Caire, à Guizeh et aux quartiers environnants tous les jours sauf le vendredi.</p>',
    'delivery', true, now() - interval '4 days'
  ),
  (
    '90000000-0000-4000-8000-000000000005', 'flower-delivery-alexandria', 'city', 'alexandria', 'a0000000-0000-4000-8000-000000000002',
    'Flower delivery in Alexandria', 'توصيل الزهور في الإسكندرية', 'Livraison de fleurs à Alexandrie',
    'Same-day bouquets across the coastal city, from Raml to Maamoura.', 'باقات في نفس اليوم في جميع أنحاء المدينة الساحلية، من الرمل إلى المعمورة.', 'Bouquets le jour même dans toute la ville côtière, de Raml à Maamoura.',
    '<p>Alexandria enjoys same-day delivery across the coastal city, including Raml, Maamoura, and the east and west districts.</p><p>Order before the cutoff and pick a window that suits the recipient.</p>',
    '<p>تتمتع الإسكندرية بتوصيل نفس اليوم في جميع أنحاء المدينة الساحلية، بما في ذلك الرمل والمعمورة والمناطق الشرقية والغربية.</p><p>اطلب قبل موعد القطع واختر الوقت المناسب للمستلم.</p>',
    '<p>Alexandrie bénéficie de la livraison le jour même dans toute la ville côtière, y compris Raml, Maamoura et les quartiers est et ouest.</p><p>Commandez avant la limite et choisissez un créneau qui convient au destinataire.</p>',
    'delivery', true, now() - interval '3 days'
  )
on conflict (id) do update
  set slug = excluded.slug,
      type = excluded.type,
      city_code = excluded.city_code,
      title_en = excluded.title_en,
      title_ar = excluded.title_ar,
      title_fr = excluded.title_fr,
      excerpt_en = excluded.excerpt_en,
      excerpt_ar = excluded.excerpt_ar,
      excerpt_fr = excluded.excerpt_fr,
      content_en = excluded.content_en,
      content_ar = excluded.content_ar,
      content_fr = excluded.content_fr,
      category = excluded.category,
      published = excluded.published,
      published_at = excluded.published_at,
      author_id = excluded.author_id;

-- ---------------------------------------------------------------------------
-- Done. Run supabase/migrations/001_commerce.sql first.
-- ---------------------------------------------------------------------------
