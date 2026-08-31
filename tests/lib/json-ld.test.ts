import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from '@/lib/sanitize-html';

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

describe('serializeJsonLd', () => {
  it('neutralizes a </script> breakout in a review body', () => {
    const data = { rating: 5, review: { body: '</script><script>alert(document.cookie)</script>' } };
    const json = serializeJsonLd(data);
    expect(json).not.toContain('</script>');
    expect(json).not.toContain('<script>');
    expect(JSON.parse(json)).toEqual(data);
  });

  it('escapes <, > and & as unicode escapes rather than entities', () => {
    expect(serializeJsonLd({ name: 'Roses & Lilies <deluxe>' })).toBe('{"name":"Roses \\u0026 Lilies \\u003cdeluxe\\u003e"}');
    expect(JSON.parse(serializeJsonLd({ name: 'Roses & Lilies <deluxe>' }))).toEqual({ name: 'Roses & Lilies <deluxe>' });
  });

  it('escapes U+2028 and U+2029, which are line terminators in JavaScript', () => {
    const json = serializeJsonLd({ body: `a${LINE_SEPARATOR}b${PARAGRAPH_SEPARATOR}c` });
    expect(json).toBe('{"body":"a\\u2028b\\u2029c"}');
    expect(json).not.toContain(LINE_SEPARATOR);
    expect(json).not.toContain(PARAGRAPH_SEPARATOR);
    expect(JSON.parse(json)).toEqual({ body: `a${LINE_SEPARATOR}b${PARAGRAPH_SEPARATOR}c` });
  });

  it('leaves JSON structure and safe values unchanged', () => {
    const data = { '@context': 'https://schema.org/', '@type': 'Product', offers: [{ price: 12.5, priceCurrency: 'EGP' }] };
    expect(serializeJsonLd(data)).toBe(JSON.stringify(data));
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
