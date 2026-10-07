import { expect, test } from "@playwright/test";
import { z } from "zod";
import { blockThirdParties, jsonLdNodes, nodesOf, pathOf } from "./helpers";

// The Voltorb Flip solver page, read off the running production build: what a
// crawler sees with JavaScript off, then the island working with it on.

const SOLVER_PATH = "/games/super-voltorb-flip/solver";
const GAME_PATH = "/games/super-voltorb-flip";

const webApplicationSchema = z.object({ "@type": z.literal("WebApplication"), url: z.string() });
const faqPageSchema = z.object({
  "@type": z.literal("FAQPage"),
  mainEntity: z.array(z.object({ name: z.string() })),
});
const breadcrumbSchema = z.object({
  "@type": z.literal("BreadcrumbList"),
  itemListElement: z.array(z.object({ name: z.string() })),
});

test("the solver page server-renders its copy, JSON-LD and its own share image", async ({
  browser,
  baseURL,
  request,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await blockThirdParties(context, baseURL);
  const page = await context.newPage();

  try {
    await page.goto(SOLVER_PATH, { waitUntil: "domcontentloaded" });

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText("Voltorb Flip Solver");
    await expect(
      page.getByRole("heading", { level: 2, name: "How to read the clues" }),
    ).toHaveCount(1);

    const nodes = await jsonLdNodes(page);
    const [app] = nodesOf(nodes, webApplicationSchema);
    expect(app && pathOf(app.url)).toBe(SOLVER_PATH);

    const [faq] = nodesOf(nodes, faqPageSchema);
    const questions = await page.locator("h3").allTextContents();
    expect(faq?.mainEntity.map((q) => q.name)).toEqual(questions);

    const [crumbs] = nodesOf(nodes, breadcrumbSchema);
    expect(crumbs?.itemListElement.map((c) => c.name)).toEqual([
      "Home",
      "Games",
      "Super Voltorb Flip",
      "Solver",
    ]);

    // Next appends a ?<hash> to file-based image URLs, so match the path by substring.
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(ogImage).toContain(`${SOLVER_PATH}/opengraph-image`);
    if (ogImage) {
      const image = await request.get(pathOf(ogImage));
      expect(image.status(), ogImage).toBe(200);
      expect(image.headers()["content-type"], ogImage).toContain("image/png");
    }
  } finally {
    await context.close();
  }
});

test("typing the all-1s clue set shows one fitting board and odds on every tile", async ({
  page,
}) => {
  await page.goto(SOLVER_PATH);
  for (const kind of ["Row", "Column"]) {
    for (let i = 1; i <= 5; i++) {
      await page.getByLabel(`${kind} ${i} coins`).fill("5");
      await page.getByLabel(`${kind} ${i} Voltorbs`).fill("0");
    }
  }
  await expect(page.getByRole("status")).toContainText("1 board fits");
  await expect(page.getByRole("button", { name: /0% Voltorb/ })).toHaveCount(25);
});

test("the game page still answers on its own route and links to the solver", async ({ page }) => {
  const res = await page.goto(GAME_PATH, { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBe(200);
  await expect(page.locator("h1").first()).toHaveText("Super Voltorb Flip");
  await expect(page.locator(`a[href="${SOLVER_PATH}"]`).first()).toBeAttached();
});
