import { describe, expect, it } from 'vitest';
import { buildPersonJsonLd } from '@/features/seo/person-jsonld';

describe('person JSON-LD', () => {
  it('builds a Person with name, url, and optional fields', () => {
    const ld = buildPersonJsonLd({
      name: 'Nour Hassan',
      url: 'https://rosette.fly.dev/en/cairo/blog/authors/nour-hassan',
      jobTitle: 'Founder & head florist',
      description: 'Nour founded Rosette.',
      image: 'https://example.com/nour.jpg',
    });
    expect(ld['@type']).toBe('Person');
    expect(ld.name).toBe('Nour Hassan');
    expect(ld.url).toBe('https://rosette.fly.dev/en/cairo/blog/authors/nour-hassan');
    expect(ld.jobTitle).toBe('Founder & head florist');
    expect(ld.description).toBe('Nour founded Rosette.');
    expect(ld.image).toBe('https://example.com/nour.jpg');
  });

  it('omits optional fields that are absent', () => {
    const ld = buildPersonJsonLd({ name: 'Nour Hassan', url: 'https://rosette.fly.dev/en/cairo/blog/authors/nour-hassan' });
    expect(ld['@type']).toBe('Person');
    expect(ld.jobTitle).toBeUndefined();
    expect(ld.description).toBeUndefined();
    expect(ld.image).toBeUndefined();
  });
});
