import type { City, Country } from './types';

export const countries: Country[] = [
  { code: 'EG', name: 'Egypt' },
];

export const cities: City[] = [
  { code: 'greater-cairo', slug: 'cairo', name: 'Greater Cairo', nameAr: 'القاهرة الكبرى', nameFr: 'Le Grand Caire', countryCode: 'EG', sameDay: true },
  { code: 'alexandria', slug: 'alexandria', name: 'Alexandria', nameAr: 'الإسكندرية', nameFr: 'Alexandrie', countryCode: 'EG', sameDay: true },
  { code: 'mansoura', slug: 'mansoura', name: 'Mansoura', nameAr: 'المنصورة', nameFr: 'Mansourah', countryCode: 'EG', sameDay: false },
  { code: 'zagazig', slug: 'zagazig', name: 'Zagazig', nameAr: 'الزقازيق', nameFr: 'Zagazig', countryCode: 'EG', sameDay: false },
  { code: 'tanta', slug: 'tanta', name: 'Tanta', nameAr: 'طنطا', nameFr: 'Tanta', countryCode: 'EG', sameDay: false },
  { code: 'menofya', slug: 'menofya', name: 'Menofya', nameAr: 'المنوفية', nameFr: 'Menoufia', countryCode: 'EG', sameDay: false },
  { code: 'north-coast', slug: 'north-coast', name: 'North Coast', nameAr: 'الساحل الشمالي', nameFr: 'Côte Nord', countryCode: 'EG', sameDay: false },
  { code: 'ain-sokhna', slug: 'ain-sokhna', name: 'Ain Sokhna', nameAr: 'العين السخنة', nameFr: 'Aïn Sokhna', countryCode: 'EG', sameDay: false },
  { code: 'ismailia', slug: 'ismailia', name: 'Ismailia', nameAr: 'الإسماعيلية', nameFr: 'Ismaïlia', countryCode: 'EG', sameDay: false },
  { code: 'banha', slug: 'banha', name: 'Banha', nameAr: 'بنها', nameFr: 'Benha', countryCode: 'EG', sameDay: false },
  { code: 'suez', slug: 'suez', name: 'Suez', nameAr: 'السويس', nameFr: 'Suez', countryCode: 'EG', sameDay: false },
];

export function getCity(cityCode: string) {
  return cities.find((city) => city.code === cityCode) ?? null;
}

export function getCityBySlug(slug: string) {
  return cities.find((city) => city.slug === slug) ?? null;
}
