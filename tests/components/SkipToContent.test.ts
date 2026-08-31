import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { messages } from '@/features/i18n/dictionaries';

const layout = readFileSync('app/layout.tsx', 'utf8');

describe('skip to content link', () => {
  it('is the first focusable element in the body', () => {
    const bodyStart = layout.indexOf('<body>');
    const skipLink = layout.indexOf('href="#main-content"');
    const scriptStart = layout.indexOf('<script', bodyStart);

    expect(bodyStart).toBeGreaterThan(-1);
    expect(skipLink).toBeGreaterThan(bodyStart);
    expect(skipLink).toBeLessThan(scriptStart);
  });

  it('stays visually hidden until focused', () => {
    const skipLink = layout.indexOf('href="#main-content"');
    const anchorEnd = layout.indexOf('</a>', skipLink);
    const anchor = layout.slice(skipLink, anchorEnd);

    expect(anchor).toContain('sr-only');
    expect(anchor).toContain('focus:not-sr-only');
  });

  it('uses a translated label in every locale', () => {
    expect(layout).toContain("t('skipToContent')");
    for (const locale of ['en', 'ar', 'fr'] as const) {
      expect(messages[locale].skipToContent, locale).toBeTruthy();
    }
    const values = new Set((['en', 'ar', 'fr'] as const).map((l) => messages[l].skipToContent));
    expect(values.size).toBe(3);
  });

  it('defines the featured homepage copy in every locale', () => {
    const keys = [
      'featuredGestures',
      'featuredNameWhiteEdit',
      'featuredNameCrimsonDusk',
      'featuredNameMorningLight',
      'featuredNameSingleStem',
      'featuredBadgeSameDayMaadi',
      'featuredBadgeSameDayZamalek',
      'featuredBadgePreorder',
      'checkoutStepBag',
      'checkoutStepDelivery',
      'checkoutStepPayment',
    ];
    for (const k of keys) {
      expect(messages.en[k], `en.${k}`).toBeTruthy();
      expect(messages.ar[k], `ar.${k}`).toBeTruthy();
      expect(messages.fr[k], `fr.${k}`).toBeTruthy();
    }
  });
});
