import { expect, test } from "@playwright/test";
import { blockThirdParties } from "./helpers";

// Tower Stacker is a first-party canvas game: it must boot, take a drop, end a run and
// restart without writing anything to the app. It is listed in the grid and the
// sitemap like the other games.

const GAME_PATH = "/games/tower-stacker?tower-seed=e2e";

test("the canvas game starts, takes drops, ends and restarts with no network writes", async ({
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
    const stage = page.getByTestId("tower-stage");
    await expect(stage).toHaveAttribute("data-phase", "ready", { timeout: 20_000 });
    await expect(page.locator("iframe")).toHaveCount(0);

    await page.getByRole("button", { name: "Start" }).click();
    await expect(stage).toHaveAttribute("data-phase", "live");

    // Drop until the run ends; every drop either lands or ends it, so this is bounded.
    for (let i = 0; i < 40; i++) {
      if ((await stage.getAttribute("data-phase")) === "over") break;
      await page.keyboard.press("Space");
      await page.waitForTimeout(450);
    }
    await expect(stage).toHaveAttribute("data-phase", "over", { timeout: 20_000 });
    await expect(page.getByTestId("tower-over-card")).toBeVisible();

    await page.getByRole("button", { name: "Play again" }).click();
    await expect(stage).toHaveAttribute("data-phase", "live");
    await expect(stage).toHaveAttribute("data-floors", "0");

    // Sentry's session pings POST to the /monitoring tunnel and analytics loads from other
    // origins; blockThirdParties aborts both, so neither leaves the machine. Any other POST
    // reached the app, which is the write this run must never make.
    expect(posts.filter((url) => !blocked.includes(url))).toEqual([]);
  } finally {
    await context.close();
  }
});
