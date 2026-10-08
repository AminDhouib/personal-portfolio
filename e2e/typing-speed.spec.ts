import { expect, test } from "@playwright/test";
import { blockThirdParties } from "./helpers";

// Typing Speed against the production build: a full passage typed with real key events ends on
// the results card with honest figures, paste is refused, and the phone layout neither overflows
// nor shrinks the Start button below a 44px touch target. Typing Speed has no leaderboard and
// no network call of its own; third-party hosts are blocked per test.

const GAME_PATH = "/games/typing-speed";

test.describe("Typing Speed", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await blockThirdParties(context, baseURL);
  });

  test("a full passage ends on the results card with net and raw WPM and 100% accuracy", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(GAME_PATH);
    const target = page.getByTestId("ts-target");
    await expect(target).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Quote" }).click();
    const passage = (await target.locator(".sr-only").textContent()) ?? "";
    expect(passage.length).toBeGreaterThan(100);

    await target.click();
    await page.keyboard.type(passage, { delay: 15 });

    await expect(page.getByTestId("ts-net-wpm")).toBeVisible();
    const net = Number(await page.getByTestId("ts-net-wpm").textContent());
    expect(net).toBeGreaterThan(0);
    await expect(page.getByTestId("ts-raw-wpm")).toContainText("raw WPM");
    await expect(page.getByTestId("ts-accuracy")).toContainText("100%");
    await expect(page.getByTestId("ts-mistakes")).toContainText("0 mistakes typed, 0 left");
  });

  test("a 15 second words run ends on the graph and key map, and the mode is remembered", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(GAME_PATH);
    await expect(page.getByTestId("ts-target")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Words" }).click();
    await page.getByRole("button", { name: "15 seconds" }).click();
    await page.getByTestId("ts-target").click();

    const results = page.getByTestId("ts-net-wpm");
    let typed = 0;
    for (let i = 0; i < 40 && !(await results.isVisible()); i++) {
      const text = (await page.getByTestId("ts-target").locator(".sr-only").textContent()) ?? "";
      await page.keyboard.type(text.slice(typed, typed + 40), { delay: 15 });
      typed += 40;
    }
    await expect(results).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("svg[role='img']").first()).toBeVisible();
    await expect(page.locator("[data-key]").first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "15 seconds" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("paste into the typing area is refused", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(GAME_PATH);
    await expect(page.getByTestId("ts-target")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("ts-target").click();

    const prevented = await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>("input[data-ts-hidden]");
      if (!input) throw new Error("hidden typing input not found");
      const event = new InputEvent("beforeinput", {
        inputType: "insertFromPaste",
        data: "pasted",
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await expect(page.getByTestId("ts-net-wpm")).toHaveCount(0);
  });

  test("phone layout at 390px: no horizontal overflow and a 44px Start button", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    await blockThirdParties(context, baseURL);
    const page = await context.newPage();
    try {
      await page.goto(GAME_PATH);
      const start = page.getByRole("button", { name: "Start typing" });
      await expect(start).toBeVisible({ timeout: 20_000 });
      const box = await start.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    } finally {
      await context.close();
    }
  });
});
