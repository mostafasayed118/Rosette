import { describe, expect, it } from 'vitest';
import { buildBreadcrumbJsonLd, buildLocalBusinessJsonLd, buildOrganizationJsonLd } from '@/features/seo/site-jsonld';

const base = 'https://rosette.example';

describe('buildOrganizationJsonLd', () => {
  it('describes the florist as an Organization with logo and locale-aware url', () => {
    const json = buildOrganizationJsonLd({ base, locale: 'en' });
    expect(json['@type']).toBe('Organization');
    expect(json.name).toBe('Rosette');
    expect(json.url).toBe(`${base}/en`);
    expect(json.logo).toContain(base);
  });

  it('keeps sameAs entries absolute when provided', () => {
    const json = buildOrganizationJsonLd({ base, locale: 'ar', sameAs: ['https://instagram.com/rosette'] });
    expect(json.url).toBe(`${base}/ar`);
    expect(json.sameAs).toEqual(['https://instagram.com/rosette']);
  });

  it('omits sameAs when there are no profiles', () => {
    expect(buildOrganizationJsonLd({ base, locale: 'en' }).sameAs).toBeUndefined();
  });
});

describe('buildLocalBusinessJsonLd', () => {
  it('marks the storefront as a Florist serving the delivery city', () => {
    const json = buildLocalBusinessJsonLd({ base, locale: 'en', cityName: 'Cairo', citySlug: 'cairo' });
    expect(json['@type']).toBe('Florist');
    expect(json.areaServed).toMatchObject({ '@type': 'City', name: 'Cairo' });
    expect(json.address).toMatchObject({ '@type': 'PostalAddress', addressCountry: 'EG' });
    expect(json.url).toBe(`${base}/en/cairo`);
  });

  it('advertises the price range and currency', () => {
    const json = buildLocalBusinessJsonLd({ base, locale: 'fr', cityName: 'Alexandrie', citySlug: 'alexandria' });
    expect(json.priceRange).toBeTruthy();
    expect(json.currenciesAccepted).toBe('EGP');
  });
});

describe('buildBreadcrumbJsonLd', () => {
  it('numbers each crumb from one and resolves absolute urls', () => {
    const json = buildBreadcrumbJsonLd({ base, items: [{ name: 'Home', path: '/en/cairo' }, { name: 'Collection', path: '/en/cairo/shop' }] });
    expect(json['@type']).toBe('BreadcrumbList');
    expect(json.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/en/cairo` },
      { '@type': 'ListItem', position: 2, name: 'Collection', item: `${base}/en/cairo/shop` },
    ]);
  });

  it('drops the item url for the final crumb when it is the current page', () => {
    const json = buildBreadcrumbJsonLd({ base, items: [{ name: 'Home', path: '/en/cairo' }, { name: 'Rose Hour' }] });
    expect(json.itemListElement[1]).toEqual({ '@type': 'ListItem', position: 2, name: 'Rose Hour' });
  });

  it('returns an empty list when given no crumbs', () => {
    expect(buildBreadcrumbJsonLd({ base, items: [] }).itemListElement).toEqual([]);
  });
});
