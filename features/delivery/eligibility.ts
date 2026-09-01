/**
 * Delivery-date rules shared by the product page, the checkout form, and the
 * server-side order validator.
 *
 * Before this module existed the Friday-closed rule lived only inside
 * `CatalogRepository.isDeliverable()`, which had zero callers — the storefront
 * happily accepted dates the studio cannot honour. Keeping the rule in one
 * pure function means the three call sites can never drift apart.
 */

/** The studio rests on Fridays. */
export const CLOSED_WEEKDAY = 5;

export type DeliveryDateRejection = 'invalid_date' | 'closed_weekday';

export type DeliveryDateCheck =
  | { eligible: true }
  | { eligible: false; reason: DeliveryDateRejection };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function checkDeliveryDate(date: unknown): DeliveryDateCheck {
  if (typeof date !== 'string' || !ISO_DATE.test(date)) return { eligible: false, reason: 'invalid_date' };
  // Noon anchors the parse so a timezone shift cannot slide the date across a
  // day boundary and report the wrong weekday.
  const parsed = new Date(`${date}T12:00:00`);
  const [year, month, day] = date.split('-').map(Number);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() + 1 !== month ||
    parsed.getDate() !== day
  ) return { eligible: false, reason: 'invalid_date' };
  if (parsed.getDay() === CLOSED_WEEKDAY) return { eligible: false, reason: 'closed_weekday' };
  return { eligible: true };
}

export function isDeliveryDateEligible(date: unknown): boolean {
  return checkDeliveryDate(date).eligible;
}
