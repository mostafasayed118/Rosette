import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { getBaseUrl } from "./base-url";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  const context = await browser.newContext();
  page = await context.newPage();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe("Gift finder quiz", () => {
  it("completes and renders results", async () => {
    await page.goto(`${getBaseUrl()}/en/cairo/gift-finder`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /start the quiz/i }).waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("button", { name: /start the quiz/i }).click();

    const pick = async (label: string) => {
      await page.getByRole("button", { name: label, exact: true }).click();
    };

    await page.getByText(/who's it for/i).waitFor({ state: "visible", timeout: 10_000 });
    await pick("A partner");
    await pick("Celebration"); // EN value of the `celebration` key (the birthday occasion)
    await pick("EGP 150–250");
    await pick("Red");
    await pick("Romantic");

    await page.getByText(/your picks/i).waitFor({ state: "visible", timeout: 15_000 });
    expect(await page.getByText(/add to bag/i).count()).toBeGreaterThan(0);
  });
});
