import type { City, Country } from './types';

export const countries: Country[] = [
  { code: 'EG', name: 'Egypt' },
];

export const cities: City[] = [
  { code: 'greater-cairo', name: 'Greater Cairo', nameAr: 'القاهرة الكبرى', countryCode: 'EG', sameDay: true },
  { code: 'alexandria', name: 'Alexandria', nameAr: 'الإسكندرية', countryCode: 'EG', sameDay: true },
  { code: 'mansoura', name: 'Mansoura', nameAr: 'المنصورة', countryCode: 'EG', sameDay: false },
  { code: 'zagazig', name: 'Zagazig', nameAr: 'الزقازيق', countryCode: 'EG', sameDay: false },
  { code: 'tanta', name: 'Tanta', nameAr: 'طنطا', countryCode: 'EG', sameDay: false },
  { code: 'menofya', name: 'Menofya', nameAr: 'المنوفية', countryCode: 'EG', sameDay: false },
  { code: 'north-coast', name: 'North Coast', nameAr: 'الساحل الشمالي', countryCode: 'EG', sameDay: false },
  { code: 'ain-sokhna', name: 'Ain Sokhna', nameAr: 'العين السخنة', countryCode: 'EG', sameDay: false },
  { code: 'ismailia', name: 'Ismailia', nameAr: 'الإسماعيلية', countryCode: 'EG', sameDay: false },
  { code: 'banha', name: 'Banha', nameAr: 'بنها', countryCode: 'EG', sameDay: false },
  { code: 'suez', name: 'Suez', nameAr: 'السويس', countryCode: 'EG', sameDay: false },
];

export function getCity(cityCode: string) {
  return cities.find((city) => city.code === cityCode) ?? null;
}
