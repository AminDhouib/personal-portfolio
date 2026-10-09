import { expect, test, type Page } from "@playwright/test";
import { blockThirdParties } from "./helpers";

// Script Knight against the production build, with the real sandbox worker: a passing solution
// clears floor 1, a loop that never ends is cut off and the page stays alive (the wait includes the
// worker bundle load, so it is CI-safe rather than the 0.25 s turn limit), and the sandbox has no
// network (fetch is undefined inside it). The page is hidden (noindex and out of every list) until
// launch, but it is still served at its own route.

const GAME_PATH = "/games/script-knight";

async function writeCode(page: Page, code: string) {
  const editor = page.getByLabel("Your Player code (JavaScript)");
  await expect(editor).toBeVisible({ timeout: 20_000 });
  await editor.fill(code);
}

async function runAndSkipToEnd(page: Page) {
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const skip = page.getByRole("button", { name: "Skip to end" });
  await expect(skip).toBeEnabled({ timeout: 10_000 });
  await skip.click();
}

test.describe("Script Knight", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await blockThirdParties(context, baseURL);
    // The page writes nothing to the app. T7-5 adds a board that could, so a write is refused here.
    await context.route("**/api/arcade/scores**", (route) =>
      route.request().method() === "POST" ? route.abort() : route.fallback(),
    );
  });

  test("a walking Player clears floor 1 in the real sandbox", async ({ page }) => {
    await page.goto(GAME_PATH);
    await writeCode(page, "class Player {\n  playTurn(warrior) {\n    warrior.walk();\n  }\n}\n");
    await runAndSkipToEnd(page);
    await expect(page.getByText("Floor passed")).toBeVisible({ timeout: 10_000 });
  });

  test("a loop that never ends is stopped in time and the page stays responsive", async ({
    page,
  }) => {
    await page.goto(GAME_PATH);
    await writeCode(page, "class Player {\n  playTurn(warrior) {\n    while (true) {}\n  }\n}\n");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByText(/ran longer than 0\.25 s/)).toBeVisible({ timeout: 20_000 });

    const sound = page.getByRole("button", { name: /^Sound (on|off)$/ });
    const before = await sound.textContent();
    await sound.click();
    await expect(sound).not.toHaveText(before ?? "");
  });

  test("the sandbox has no fetch", async ({ page }) => {
    await page.goto(GAME_PATH);
    await writeCode(
      page,
      "class Player {\n  playTurn(warrior) {\n    warrior.think(typeof fetch);\n    warrior.walk();\n  }\n}\n",
    );
    await runAndSkipToEnd(page);
    await expect(page.getByRole("log")).toContainText("think: undefined");
  });

  test("Today's floor shows its par, runs in the real sandbox and posts nothing on a fail", async ({
    page,
  }) => {
    // Every leaderboard request is stubbed; a POST here would be a bug, so count them.
    const posts: string[] = [];
    await page.route("**/api/arcade/scores**", async (route) => {
      if (route.request().method() === "POST") posts.push(route.request().url());
      await route.fulfill({ json: { entries: [], you: null } });
    });
    await page.goto(GAME_PATH);
    await page.getByRole("button", { name: "Today's floor" }).click();
    await expect(page.getByText(/Par \d+/)).toBeVisible();

    // Walking straight ahead never clears a floor with enemies on it.
    await writeCode(page, "class Player {\n  playTurn(warrior) {\n    warrior.walk();\n  }\n}\n");
    await runAndSkipToEnd(page);
    await expect(page.getByText("Floor not passed")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Submit" })).toHaveCount(0);
    expect(posts).toEqual([]);
  });
  test("a program that does nothing ends with a visible result in seconds", async ({ page }) => {
    await page.goto(GAME_PATH);
    // The starter is comment-only: the knight idles to the 200-turn limit. The replay used to take
    // a minute at 1x, so no Skip is pressed here.
    await expect(page.getByLabel("Your Player code (JavaScript)")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByText("Floor not passed")).toBeVisible({ timeout: 10_000 });
  });

  test("phone: clear Narrow Path 1 by taps in the play sheet, with the page locked", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    await blockThirdParties(context, baseURL);
    await context.route("**/api/arcade/scores**", (route) =>
      route.request().method() === "POST" ? route.abort() : route.fallback(),
    );
    const page = await context.newPage();
    try {
      await page.goto(GAME_PATH);
      // A touch screen plays by hand: no editor, a pad, and a button that opens the sheet.
      await expect(page.getByRole("button", { name: "Play by hand" })).toHaveAttribute(
        "aria-pressed",
        "true",
        { timeout: 20_000 },
      );
      await page.getByRole("button", { name: "Play this floor" }).tap();
      const locked = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
      expect(locked).toBe("hidden");

      const walk = page.getByRole("button", { name: "Walk forward" });
      const box = await walk.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      for (let i = 0; i < 7; i += 1) await walk.tap();
      await expect(page.getByText("Floor passed")).toBeVisible();

      // The page behind the sheet never scrolled, and nothing spilled sideways.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(sideways).toBeLessThanOrEqual(0);

      await page.getByRole("button", { name: "Exit" }).tap();
      const after = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
      expect(after).not.toBe("hidden");
    } finally {
      await context.close();
    }
  });
});
