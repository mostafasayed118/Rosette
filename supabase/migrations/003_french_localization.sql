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
update public.products set add_ons = '[{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","name_fr":"Chocolat noir","price_minor":1800}]'::jsonb where slug = 'terracotta-love';
update public.products set add_ons = '[{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","name_fr":"Chocolat noir","price_minor":1800},{"id":"balloon","name_en":"Celebration balloon","name_ar":"بالون احتفالي","name_fr":"Ballon de fête","price_minor":1200}]'::jsonb where slug = 'roses-in-a-box';
update public.products set add_ons = '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500},{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","name_fr":"Chocolat noir","price_minor":1800}]'::jsonb where slug in ('midnight-roses', 'petal-box', 'grand-roses');
