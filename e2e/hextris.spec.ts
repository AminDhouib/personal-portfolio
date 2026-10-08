import { expect, test, type Page } from "@playwright/test";
import { blockThirdParties } from "./helpers";

// Hextris against the production build: a click starts the run, the game's keys do not scroll
// the page, pause and resume work from the button and from a window blur, the canvas is painted
// while the run plays, and nothing is written to the app. Hextris only POSTs when a player
// submits a name, which this run never does.

const GAME_PATH = "/games/hextris";

/** Device pixels with any paint in the middle fifth of the canvas, where the board sits. */
async function paintedCentrePixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) throw new Error("hextris canvas not found");
    const top = Math.floor(canvas.height * 0.4);
    const rows = Math.max(1, Math.floor(canvas.height * 0.2));
    const { data } = ctx.getImageData(0, top, canvas.width, rows);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) painted += 1;
    return painted;
  });
}

test("the canvas game starts, keeps the page still, pauses and paints with no network writes", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const blocked = await blockThirdParties(context, baseURL);
  const page = await context.newPage();
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  try {
    await page.goto(GAME_PATH);
    await expect(page.getByText("Click to start")).toBeVisible({ timeout: 20_000 });
    const canvas = page.locator("canvas");
    const pause = page.getByRole("button", { name: "Pause", exact: true });
    const pausedCard = page.getByText("Take a breath");

    // The start screen passes clicks through to the canvas, which starts the run.
    await canvas.click();
    await expect(pause).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Click to start")).toHaveCount(0);

    // Space (pause, then resume) and the game's arrows are claimed by the game, so the page
    // must not move. The arrows rotate, which also dismisses the tutorial overlay.
    const scrollBefore = await page.evaluate(() => window.scrollY);
    for (const key of ["Space", "Space", "ArrowLeft", "ArrowRight", "ArrowDown"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    await expect(pause).toBeVisible();
    await expect(page.getByRole("button", { name: "Dismiss tutorial" })).toHaveCount(0);

    // Pause and resume from the buttons.
    await pause.click();
    await expect(pausedCard).toBeVisible();
    await pausedCard.locator("..").getByRole("button", { name: "Resume" }).click();
    await expect(pausedCard).toHaveCount(0);
    await expect(pause).toBeVisible();

    // Losing window focus pauses the run; Space resumes it.
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(pausedCard).toBeVisible();
    await page.keyboard.press("Space");
    await expect(pausedCard).toHaveCount(0);
    await expect(pause).toBeVisible();

    // A few seconds of play later the board is still being painted.
    await page.waitForTimeout(3_000);
    await expect(pause).toBeVisible();
    expect(await paintedCentrePixels(page)).toBeGreaterThan(200);

    // Sentry's session pings POST to the /monitoring tunnel and analytics loads from other
    // origins; blockThirdParties aborts both, so neither leaves the machine. Any other POST
    // reached the app, which is the write this run must never make.
    expect(posts.filter((url) => !blocked.includes(url))).toEqual([]);
  } finally {
    await context.close();
  }
});
