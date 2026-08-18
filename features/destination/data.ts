import type { City, Country } from './types';

export const countries: Country[] = [
  { code: 'EG', name: 'Egypt' },
];

export const cities: City[] = [
  { code: 'greater-cairo', name: 'Greater Cairo', nameAr: 'القاهرة الكبرى', nameFr: 'Le Grand Caire', countryCode: 'EG', sameDay: true },
  { code: 'alexandria', name: 'Alexandria', nameAr: 'الإسكندرية', nameFr: 'Alexandrie', countryCode: 'EG', sameDay: true },
  { code: 'mansoura', name: 'Mansoura', nameAr: 'المنصورة', nameFr: 'Mansourah', countryCode: 'EG', sameDay: false },
  { code: 'zagazig', name: 'Zagazig', nameAr: 'الزقازيق', nameFr: 'Zagazig', countryCode: 'EG', sameDay: false },
  { code: 'tanta', name: 'Tanta', nameAr: 'طنطا', nameFr: 'Tanta', countryCode: 'EG', sameDay: false },
  { code: 'menofya', name: 'Menofya', nameAr: 'المنوفية', nameFr: 'Menoufia', countryCode: 'EG', sameDay: false },
  { code: 'north-coast', name: 'North Coast', nameAr: 'الساحل الشمالي', nameFr: 'Côte Nord', countryCode: 'EG', sameDay: false },
  { code: 'ain-sokhna', name: 'Ain Sokhna', nameAr: 'العين السخنة', nameFr: 'Aïn Sokhna', countryCode: 'EG', sameDay: false },
  { code: 'ismailia', name: 'Ismailia', nameAr: 'الإسماعيلية', nameFr: 'Ismaïlia', countryCode: 'EG', sameDay: false },
  { code: 'banha', name: 'Banha', nameAr: 'بنها', nameFr: 'Benha', countryCode: 'EG', sameDay: false },
  { code: 'suez', name: 'Suez', nameAr: 'السويس', nameFr: 'Suez', countryCode: 'EG', sameDay: false },
];

export function getCity(cityCode: string) {
  return cities.find((city) => city.code === cityCode) ?? null;
}
