insert into public.categories (slug, name_en, name_ar)
values
  ('birthday', 'Birthdays', 'أعياد الميلاد'),
  ('romance', 'Romance', 'رومانسية'),
  ('thanks', 'Thank you', 'شكر وامتنان')
on conflict (slug) do nothing;

insert into public.cities (code, name_en, name_ar, same_day)
values
  ('cairo', 'Cairo', 'القاهرة', true),
  ('alexandria', 'Alexandria', 'الإسكندرية', true),
  ('giza', 'Giza', 'الجيزة', true)
on conflict (code) do nothing;

insert into public.delivery_rules (city_code, fee_minor, cutoff_hour)
select code, case when same_day then 1500 else 2500 end, 14
from public.cities
where code in ('cairo', 'alexandria', 'giza')
  and not exists (select 1 from public.delivery_rules r where r.city_code = cities.code);
