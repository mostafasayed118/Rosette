import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Stagehand } from '@browserbasehq/stagehand';
import { getBaseUrl } from './base-url';

// TOKENROUTER_API_KEY is scoped to the opencode editor — it returns 401 for direct Stagehand calls.
// Set STAGEHAND_API_KEY / OPENAI_API_KEY to enable the LLM suite; otherwise `npm run test:e2e` (Playwright) covers the same flows free.
const hasStagehandKey = Boolean(process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? process.env.STAGEHAND_API_KEY);
const describeStagehand = hasStagehandKey ? describe : describe.skip;

let stagehand: Stagehand;

beforeAll(async () => {
  const apiKey = process.env.STAGEHAND_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Set STAGEHAND_API_KEY or OPENAI_API_KEY to run Stagehand E2E tests.');
  stagehand = new Stagehand({
    env: 'LOCAL',
    model: {
      modelName: process.env.E2E_MODEL ?? 'openai/muse-spark-1.2-contributor-free',
      apiKey,
      baseURL: process.env.E2E_MODEL_BASE_URL ?? 'https://opencode.ai/zen/v1',
    } as never,
    verbose: 0,
    localBrowserLaunchOptions: { headless: true },
  });
  await stagehand.init();
}, 300_000);

afterAll(async () => {
  await stagehand?.close();
});

function getPage() {
  const page = stagehand.context.activePage() ?? stagehand.context.pages()[0];
  if (!page) throw new Error('No Stagehand page available');
  return page;
}

describeStagehand('Rosette storefront (Stagehand E2E)', () => {
  it('navigates from the homepage hero into the collection', async () => {
    const page = getPage();
    await page.goto(`${getBaseUrl()}/en/cairo`);
    expect(new URL(page.url()).pathname).toBe('/en/cairo');

    await page.locator('text=Explore the collection').click();
    await new Promise((r) => setTimeout(r, 2000));

    expect(new URL(page.url()).pathname).toMatch(/\/shop$/);
    const firstProductLink = page.locator('a[href*="/shop/"]').first();
    expect(await firstProductLink.isVisible()).toBe(true);
  });

  it('adds a bouquet to the bag from its product page', async () => {
    const page = getPage();
    await page.goto(`${getBaseUrl()}/en/cairo/shop/rose-hour`);
    expect(new URL(page.url()).pathname).toContain('/shop/rose-hour');

    await new Promise((r) => setTimeout(r, 1200));
    await page.locator('button[type="submit"]').click();

    const confirmation = page.locator('[role="status"]').first();
    const deadline = Date.now() + 20_000;
    let visible = false;
    while (Date.now() < deadline) {
      if (await confirmation.isVisible().catch(() => false)) {
        visible = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    expect(visible).toBe(true);
    const text = (await confirmation.textContent()) ?? '';
    expect(text.toLowerCase()).toContain('bag');
  });

  it('extracts the featured collection names from the shop page', async () => {
    const page = getPage();
    await page.goto(`${getBaseUrl()}/en/cairo/shop`);

    const result = await stagehand.extract(
      'list every product card on this page with its displayed name and whether a price is shown',
      z.object({
        products: z.array(
          z.object({
            name: z.string(),
            priceVisible: z.boolean(),
          }),
        ),
      }),
    );

    const products = (result as { products: Array<{ name: string; priceVisible: boolean }> }).products;
    expect(products.length).toBeGreaterThan(0);
    expect(products[0]?.name).toBeTruthy();
    expect(products.every((product: { priceVisible: boolean }) => product.priceVisible)).toBe(true);
  });
});
