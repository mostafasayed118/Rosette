import { ratingBySlug } from '@/features/reviews/aggregate';
import { demoReviews } from '@/features/reviews/demo-data';
import { getCity } from '@/features/destination/data';
import { resolveDeliveryFee, DEFAULT_DELIVERY_FEE_MINOR } from '@/features/order/delivery-rules';
import { filterProducts, paginateProducts, sortProducts } from './catalog-utils';
import { products } from './data';
import { checkDeliveryDate } from '@/features/delivery/eligibility';
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
    // The weekday/validity rule lives in one shared pure function so the PDP,
    // checkout, and this repository cannot disagree about which dates are legal.
    const check = checkDeliveryDate(date);
    if (!check.eligible) {
      return {
        eligible: false,
        reason: check.reason === 'closed_weekday'
          ? 'Our studio rests on Fridays. Choose another day.'
          : 'Choose a valid delivery date.',
        fee: 0,
      };
    }
    return { eligible: true, reason: city.sameDay ? 'Same-day delivery may be available before 2pm.' : 'Next-day delivery in this city.', fee: resolveDeliveryFee(city.code, 0) ?? DEFAULT_DELIVERY_FEE_MINOR };
  },
};
