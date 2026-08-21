import { ratingBySlug } from '@/features/reviews/aggregate';
import { demoReviews } from '@/features/reviews/demo-data';
import { getCity } from '@/features/destination/data';
import { filterProducts, paginateProducts, sortProducts } from './catalog-utils';
import { products } from './data';
import type { CatalogRepository, CatalogQuery, DeliveryEligibilityInput } from './types';

const ratings = ratingBySlug(demoReviews);

function withRatings(rows: typeof products) {
  return rows.map((product) => ({ ...product, rating: ratings.get(product.slug) ?? { average: 0, count: 0 } }));
}

export const localCatalogRepository: CatalogRepository = {
  async list(query: CatalogQuery) {
    const filtered = sortProducts(filterProducts(products, query), query.sort);
    const { items, page, perPage, totalPages, total } = paginateProducts(filtered, query.page);
    return { products: withRatings(items), total, query, page, perPage, totalPages };
  },
  async getBySlug(slug) {
    const product = products.find((product) => product.slug === slug);
    return product ? withRatings([product])[0] ?? null : null;
  },
  async isDeliverable({ destination, date }: DeliveryEligibilityInput) {
    const city = getCity(destination.cityCode);
    if (!city) return { eligible: false, reason: 'That delivery city is not supported.', fee: 0 };
    const selectedDate = new Date(`${date}T12:00:00`);
    if (Number.isNaN(selectedDate.getTime())) return { eligible: false, reason: 'Choose a valid delivery date.', fee: 0 };
    if (selectedDate.getDay() === 5) return { eligible: false, reason: 'Our studio rests on Fridays. Choose another day.', fee: 0 };
    return { eligible: true, reason: city.sameDay ? 'Same-day delivery may be available before 2pm.' : 'Next-day delivery in this city.', fee: city.sameDay ? 1500 : 2500 };
  },
};
