import { expect, test } from "@playwright/test";
import { blockThirdParties } from "./helpers";

// Typing Speed against the production build: a full passage typed with real key events ends on
// the results card with honest figures, paste is refused, and the phone layout neither overflows
// nor shrinks the Start button below a 44px touch target. Only the Daily view talks to the
// network (the arcade board, stubbed here); third-party hosts are blocked per test.

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
    await page.getByRole("button", { name: "Quote", exact: true }).click();
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
    await page.getByRole("button", { name: "Words", exact: true }).click();
    await page.getByRole("button", { name: "15 seconds", exact: true }).click();
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
    await expect(page.getByRole("button", { name: "15 seconds", exact: true })).toHaveAttribute(
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

  test("phone sheet at 390px: Start opens it, the page locks, Exit gives it all back", async ({
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
      const text = (await page.getByTestId("ts-target").locator(".sr-only").textContent()) ?? "";
      await start.tap();

      const sheet = page.getByTestId("ts-sheet");
      await expect(sheet).toBeVisible();
      await expect(page.locator("html")).toHaveClass(/typing-lock/);
      await page.keyboard.type(text.slice(0, 10), { delay: 20 });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      await sheet.getByRole("button", { name: "Exit" }).tap();
      await expect(sheet).toHaveCount(0);
      await expect(page.locator("html")).not.toHaveClass(/typing-lock/);
    } finally {
      await context.close();
    }
  });

  test("the phone stats bar keeps its height when a run ends (390px)", async ({
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
      await page.getByRole("button", { name: "Quote", exact: true }).tap();
      const stats = page.getByTestId("ts-stats");
      const before = (await stats.boundingBox())?.height ?? 0;
      const passage = (await page.getByTestId("ts-target").locator(".sr-only").textContent()) ?? "";
      await page.getByRole("button", { name: "Start typing" }).tap();
      await page.keyboard.type(passage, { delay: 15 });
      await expect(page.getByTestId("ts-net-wpm")).toBeVisible();
      await expect(page.getByTestId("ts-sheet")).toHaveCount(0);
      await expect(page.locator("html")).not.toHaveClass(/typing-lock/);
      const after = (await stats.boundingBox())?.height ?? 0;
      expect(after).toBe(before);
    } finally {
      await context.close();
    }
  });

  test("Daily: one stubbed Post carries the run, and nothing posts by itself", async ({ page }) => {
    const posts: { game: string; score: number; detail: Record<string, number> }[] = [];
    await page.route("**/api/arcade/scores**", async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        posts.push(request.postDataJSON());
        await route.fulfill({
          json: {
            ok: true,
            boards: [{ period: "daily", board: "today", rank: 1, best: 1, improved: true }],
          },
        });
        return;
      }
      await route.fulfill({
        json: { game: "typing-speed", board: "daily", entries: [], you: null },
      });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(GAME_PATH);
    await expect(page.getByTestId("ts-target")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Daily", exact: true }).click();
    await expect(page.getByTestId("ts-daily-panel")).toBeVisible();
    const passage = (await page.getByTestId("ts-target").locator(".sr-only").textContent()) ?? "";
    expect(passage.length).toBeGreaterThan(100);

    await page.getByTestId("ts-target").click();
    // 45 ms a key is about 267 WPM, under the 300 WPM ceiling the server enforces.
    await page.keyboard.type(passage, { delay: 45 });
    await expect(page.getByTestId("ts-net-wpm")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("1-day streak")).toBeVisible();
    expect(posts).toHaveLength(0);

    await page.getByLabel("Name for the board").fill("E2E");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByRole("button", { name: "Posted", exact: true })).toBeDisabled();
    expect(posts).toHaveLength(1);
    expect(posts[0]?.game).toBe("typing-speed");
    expect(Object.keys(posts[0]?.detail ?? {}).sort()).toEqual(["acc", "chars", "day", "ms"]);
    expect(posts[0]?.score).toBeGreaterThan(0);
    expect(posts[0]?.score).toBeLessThanOrEqual(300);
  });

  test("no sheet and no scroll lock at 1440px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(GAME_PATH);
    await expect(page.getByTestId("ts-target")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Start typing" }).click();
    await expect(page.getByTestId("ts-sheet")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveClass(/typing-lock/);
  });
});

// The ghost: a stored words-15 ghost at four characters a second, seeded through the
// storageState fixture (applied before any page script, so no setItem call in our code).
// Written by reasoning, not run locally: CI runs it against the production build.
const GHOST_SAMPLES = Array.from({ length: 61 }, (_, i) => i);
const GHOST_STORAGE: Record<string, string> = {
  "typing:stats": JSON.stringify({
    v: 1,
    runs: 1,
    lastMode: "words-15",
    bests: {},
    keys: {},
    daily: { streak: 0, bestStreak: 0, lastDay: null, days: 0 },
    rain: { best: 0, bestWave: 0 },
    prefs: { ghost: true },
  }),
  "typing:ghosts": JSON.stringify({
    v: 1,
    ghosts: { "words-15": { wpm: 48, samples: GHOST_SAMPLES } },
  }),
};

test.describe("Typing Speed ghost", () => {
  test.use({
    storageState: async (
      { baseURL }: { baseURL: string | undefined },
      apply: (state: {
        cookies: [];
        origins: { origin: string; localStorage: { name: string; value: string }[] }[];
      }) => Promise<void>,
    ) => {
      if (!baseURL) throw new Error("baseURL is required to seed storage");
      await apply({
        cookies: [],
        origins: [
          {
            origin: new URL(baseURL).origin,
            localStorage: Object.entries(GHOST_STORAGE).map(([name, value]) => ({ name, value })),
          },
        ],
      });
    },
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await blockThirdParties(context, baseURL);
  });

  test("the ghost caret moves during a run and the toggle hides it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(GAME_PATH);
    await expect(page.getByTestId("ts-target")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "15 seconds", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("ts-ghost")).toHaveCount(0); // not before the run starts

    await page.getByTestId("ts-target").click();
    await page.keyboard.type("t");
    const ghost = page.getByTestId("ts-ghost");
    await expect(ghost).toBeVisible();
    await expect(page.getByTestId("ts-ghost-chip")).toBeVisible();
    const first = await ghost.boundingBox();
    await page.waitForTimeout(1000);
    const second = await ghost.boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(`${second?.x},${second?.y}`).not.toBe(`${first?.x},${first?.y}`);

    await page.getByRole("button", { name: "Ghost", exact: true }).click();
    await expect(page.getByTestId("ts-ghost")).toHaveCount(0);
    await expect(page.getByTestId("ts-ghost-chip")).toHaveCount(0);
  });
});

test.describe("Typing Speed Word Rain", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await blockThirdParties(context, baseURL);
  });

  test("a typed word clears, and three missed words end the run", async ({ page }) => {
    // A fake clock drives requestAnimationFrame, so the whole run takes no real time.
    await page.clock.install();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(GAME_PATH);
    await expect(page.getByTestId("ts-target")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Rain", exact: true }).click();
    await expect(page.getByTestId("ts-rain-area")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ghost", exact: true })).toHaveCount(0);

    await page.getByTestId("ts-rain-area").click();
    await page.clock.runFor(500);
    const word = page.getByTestId("ts-rain-word").first();
    await expect(word).toBeVisible();
    const text = ((await word.textContent()) ?? "").trim();
    expect(text.length).toBeGreaterThan(1);
    await page.keyboard.type(text);
    await expect(page.getByTestId("ts-rain-score")).toHaveText(String(text.length));
    await expect(page.getByTestId("ts-rain-word").filter({ hasText: text })).toHaveCount(0);

    // Left alone, the words land one by one: 3 lives gone well inside 40 s of rain.
    await page.clock.runFor(40_000);
    await expect(page.getByTestId("ts-rain-over")).toBeVisible();
    await expect(page.getByLabel("Lives: 0")).toBeVisible();
    await expect(page.getByTestId("ts-rain-result-score")).toHaveText(String(text.length));
  });
});
