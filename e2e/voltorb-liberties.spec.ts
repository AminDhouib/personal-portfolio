import { expect, test } from "@playwright/test";
import { blockThirdParties } from "./helpers";

// T2e-2: the odds assist, in a real browser against the production build.
// blockThirdParties aborts every cross-origin request, the Sentry tunnel and the
// chat proxy; nothing here posts a score.

const GAME_PATH = "/games/super-voltorb-flip";
const ODDS = /percent Voltorb|no chance of a Voltorb|certainly a Voltorb/;

test("odds assist: off by default, on from Settings, one badge per face-down tile, in a worker", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blockThirdParties(context, baseURL);
  const page = await context.newPage();
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  try {
    await page.goto(GAME_PATH);
    const tiles = page.locator("[data-cell]");
    await expect(tiles).toHaveCount(25, { timeout: 20_000 });
    const labels = () =>
      tiles.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
    const withOdds = async () => (await labels()).filter((l) => ODDS.test(l)).length;

    expect(await withOdds()).toBe(0);
    expect(workers).toHaveLength(0);

    // The phone and desktop columns both render the mode row; one is CSS-hidden.
    const settings = page.locator("button:visible", { hasText: "Settings" }).first();
    await settings.click();
    await page.getByRole("switch", { name: "Odds assist" }).click();
    await page.keyboard.press("Escape");

    await expect.poll(withOdds, { timeout: 10_000 }).toBe(25);
    // The search ran in a worker, not on the page's main thread.
    expect(workers.length).toBeGreaterThan(0);

    // Each visible badge stays inside its tile (no overflow onto a neighbour).
    const fits = await page.evaluate(() => {
      const out: boolean[] = [];
      for (const tile of document.querySelectorAll<HTMLElement>("[data-cell]")) {
        const t = tile.getBoundingClientRect();
        for (const pill of tile.querySelectorAll<HTMLElement>("[data-odds-pill]")) {
          const p = pill.getBoundingClientRect();
          out.push(p.left >= t.left - 1 && p.right <= t.right + 1);
        }
      }
      return out;
    });
    expect(fits).toHaveLength(25);
    expect(fits.every(Boolean)).toBe(true);

    await settings.click();
    await page.getByRole("switch", { name: "Odds assist" }).click();
    await page.keyboard.press("Escape");
    await expect.poll(withOdds, { timeout: 10_000 }).toBe(0);
  } finally {
    await context.close();
  }
});

// T2e-3: the Daily board. The scores route is stubbed so nothing reaches a
// database; these checks cover structure and layout only, never a score.
test.describe("Daily board", () => {
  test("opens from the mode row, shows the day board and returns", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await blockThirdParties(context, baseURL);
    await context.route("**/api/arcade/scores**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ entries: [], you: null }),
      }),
    );
    const page = await context.newPage();
    try {
      await page.goto(GAME_PATH);
      await expect(page.locator("[data-cell]")).toHaveCount(25, { timeout: 20_000 });
      await page.locator("button:visible", { hasText: "Daily" }).first().click();
      const region = page.getByRole("region", { name: "Daily board" });
      await expect(region).toBeVisible();
      await expect(region.locator("[data-cell]")).toHaveCount(25);
      await page.getByRole("button", { name: "Back to the game" }).click();
      await expect(region).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("the Daily screen does not overflow a 360 px phone", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
    await blockThirdParties(context, baseURL);
    await context.route("**/api/arcade/scores**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ entries: [], you: null }),
      }),
    );
    const page = await context.newPage();
    try {
      await page.goto(GAME_PATH);
      await expect(page.locator("[data-cell]")).toHaveCount(25, { timeout: 20_000 });
      await page.locator("button:visible", { hasText: "Daily" }).first().click();
      await expect(page.getByRole("region", { name: "Daily board" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    } finally {
      await context.close();
    }
  });
});
