import { expect, test } from "@playwright/test";
import { blockThirdParties } from "./helpers";

// Tower Stacker is a first-party canvas game: it must boot, take a drop, end a run and
// restart without writing anything to the app. It is listed in the grid and the
// sitemap like the other games. The daily tower adds a board panel on the over card; the
// submit is route-stubbed and never clicked.

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

test("today's tower ends on the over card with the board panel and three tabs", async ({
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
  // The board read and a (never-clicked) submit are answered here; nothing reaches the app.
  await page.route("**/api/arcade/scores**", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 200, json: { ok: true, boards: [] } })
      : route.fulfill({ status: 200, json: { entries: [], you: null } }),
  );
  try {
    await page.goto("/games/tower-stacker");
    const stage = page.getByTestId("tower-stage");
    await expect(stage).toHaveAttribute("data-phase", "ready", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Today's tower/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Free build/ })).toBeVisible();
    await expect(stage).toHaveAttribute("data-mode", "daily");

    await page.getByRole("button", { name: "Start" }).click();
    await expect(stage).toHaveAttribute("data-phase", "live");

    // With no input the run never ends, so drop at a fixed interval until a miss; bounded to 60 s.
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if ((await stage.getAttribute("data-phase")) === "over") break;
      await page.keyboard.press("Space");
      await page.waitForTimeout(450);
    }
    await expect(stage).toHaveAttribute("data-phase", "over", { timeout: 20_000 });

    const panel = page.getByTestId("tower-board-panel");
    await expect(panel.getByRole("heading", { name: "Today's tower board" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Today" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "This week" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "All time" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Submit" })).toBeVisible();
    expect(posts.filter((url) => !blocked.includes(url))).toEqual([]);
  } finally {
    await context.close();
  }
});
