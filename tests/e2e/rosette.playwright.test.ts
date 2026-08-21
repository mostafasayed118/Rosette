import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { getBaseUrl } from './base-url';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  const headed = process.env.E2E_HEADED === '1';
  browser = await chromium.launch({ headless: !headed, slowMo: headed ? 400 : 0 });
  const context = await browser.newContext();
  page = await context.newPage();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe('Rosette storefront (Playwright deterministic E2E)', () => {
  it('navigates from the homepage hero into the collection', async () => {
    await page.goto(`${getBaseUrl()}/en/cairo`, { waitUntil: 'domcontentloaded' });
    expect(new URL(page.url()).pathname).toBe('/en/cairo');

    await page.getByRole('link', { name: /explore the collection/i }).click();
    await page.waitForURL(/\/shop$/);

    expect(new URL(page.url()).pathname).toMatch(/\/shop$/);
    const firstProductLink = page.locator('a[href*="/shop/"]').first();
    await firstProductLink.waitFor({ state: 'visible', timeout: 10_000 });
  });

  it('adds a bouquet to the bag from its product page', async () => {
    await page.goto(`${getBaseUrl()}/en/cairo/shop/rose-hour`, { waitUntil: 'domcontentloaded' });
    expect(new URL(page.url()).pathname).toContain('/shop/rose-hour');

    await page.getByRole('button', { name: /add to bag/i }).click();

    const confirmation = page.getByRole('status').first();
    await confirmation.waitFor({ state: 'visible', timeout: 15_000 });
    const text = (await confirmation.textContent()) ?? '';
    expect(text.toLowerCase()).toContain('bag');
  });

  it('shows product cards with prices on the shop page', async () => {
    await page.goto(`${getBaseUrl()}/en/cairo/shop`, { waitUntil: 'domcontentloaded' });

    const cards = page.locator('a[href*="/shop/"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // at least one card shows a price (EGP)
    const firstCardText = await cards.first().textContent();
    expect(firstCardText).toMatch(/EGP/i);
  });
});
