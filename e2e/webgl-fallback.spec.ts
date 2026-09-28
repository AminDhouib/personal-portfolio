import { expect, test, type Page, type Request } from "@playwright/test";
import { blockThirdParties, waitForHomeHydration } from "./helpers";

// The suite's browser runs with WebGL off (playwright.config.ts), as it is for
// a visitor with hardware acceleration disabled or a blocklisted GPU. Two
// pages mount three.js scenes where WebGL works; without it they must fall
// back to their plain layout and throw nothing. Before the fallback, the home
// page threw "Error creating WebGL context." about 20 times per load.

test.beforeEach(async ({ context, baseURL }) => {
  await blockThirdParties(context, baseURL);
});

/**
 * Collects the page's uncaught errors and unhandled rejections, and tracks its
 * script requests. `settled()` resolves once no script is in flight and two
 * frames have passed: time enough for a lazily loaded scene to mount its
 * canvas and, without WebGL, throw. (networkidle never comes on the home page,
 * where the Voltorb Flip card keeps fetching sprite frames.)
 */
function watch(page: Page) {
  const errors: string[] = [];
  const scripts = new Set<Request>();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.add(request);
  });
  const done = (request: Request) => scripts.delete(request);
  page.on("requestfinished", done);
  page.on("requestfailed", done);

  async function settled() {
    await expect.poll(() => scripts.size).toBe(0);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  }
  return { errors, settled };
}

test("the home page keeps its CSS background and shows a notice for the game, with no uncaught errors", async ({
  page,
}) => {
  const { errors, settled } = watch(page);
  await page.goto("/");
  await waitForHomeHydration(page);

  const notice = page.getByText("Orbital Dodge needs WebGL");
  await notice.scrollIntoViewIfNeeded();
  await expect(notice).toBeVisible();
  await expect(page.locator(".bg-fx-aurora")).toBeAttached();
  await settled();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Orbital Dodge's own page shows the notice instead of the game, with no uncaught errors", async ({
  page,
}) => {
  const { errors, settled } = watch(page);
  await page.goto("/games/space-shooter");

  await expect(page.getByText("Orbital Dodge needs WebGL")).toBeVisible();
  await expect(page.getByText("Loading game...")).toHaveCount(0);
  await settled();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});
