import { expect, test, type Page } from "@playwright/test";
import {
  blockThirdParties,
  gtagEvents,
  isLocalhost,
  pathOf,
  sitemapUrls,
  waitForHomeHydration,
} from "./helpers";

// The paths from a landing page to a conversation with Amin: Book a Call,
// the chat launcher, and the tracking behind them. No lead form is submitted
// and no chat message is sent -- both would reach Amin or cost money.

const LOCAL_ONLY =
  "Fires real conversion events; only run against a local build, never production analytics.";

let blocked: string[] = [];

/**
 * Scrolls to the very bottom, then lists the text, icons and controls the
 * fixed chat launcher sits on top of. Text is measured by its line boxes, not
 * its element, since a centered line's paragraph spans the full width.
 */
function contentUnderLauncher(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.documentElement;
    window.scrollTo({ top: root.scrollHeight, behavior: "instant" });
    const launcher = document.querySelector('button[aria-label="Open Amin AI chat"]');
    if (!launcher) return ["(no launcher)"];
    const zone = launcher.getBoundingClientRect();
    const overlaps = (rect: DOMRect) =>
      rect.width > 1 &&
      rect.height > 1 &&
      rect.left < zone.right &&
      rect.right > zone.left &&
      rect.top < zone.bottom &&
      rect.bottom > zone.top;

    const covered: string[] = [];
    const text = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = text.nextNode(); node; node = text.nextNode()) {
      const words = node.textContent?.trim();
      if (!words || launcher.contains(node)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some(overlaps)) covered.push(words);
    }
    for (const el of document.body.querySelectorAll("a, button, input, svg, img")) {
      if (launcher.contains(el)) continue;
      if (overlaps(el.getBoundingClientRect())) covered.push(`<${el.tagName.toLowerCase()}>`);
    }
    return covered;
  });
}

test.beforeEach(async ({ context, baseURL }) => {
  blocked = await blockThirdParties(context, baseURL);
});

test("every landing page offers a Book a Call link that opens safely in a new tab", async ({
  page,
  request,
}) => {
  const firstPost = (await sitemapUrls(request)).map(pathOf).find((p) => p.startsWith("/blog/"));
  expect(firstPost).toBeDefined();
  const bookingHrefs = new Set<string | null>();

  for (const path of ["/", "/work", "/work/caramel", "/reviews", firstPost!]) {
    const response = await page.goto(path);
    expect.soft(response?.status(), path).toBe(200);
    const links = await page.getByRole("link", { name: /book a call/i }).all();
    expect.soft(links.length, `${path} has a Book a Call link`).toBeGreaterThan(0);
    for (const link of links) {
      await expect.soft(link, path).toHaveAttribute("target", "_blank");
      await expect.soft(link, path).toHaveAttribute("rel", /\bnoopener\b/);
      bookingHrefs.add(await link.getAttribute("href"));
    }
  }

  expect([...bookingHrefs]).toHaveLength(1);
  const [bookingHref] = bookingHrefs;
  expect(new URL(bookingHref ?? "").protocol).toBe("https:");
});

test("organic landing pages close with a Book a Call card, not just the navbar button", async ({
  page,
  request,
}) => {
  // One page per project and post; a failing page costs a full expect timeout.
  test.setTimeout(120_000);
  const paths = (await sitemapUrls(request))
    .map(pathOf)
    .filter((path) => path === "/work" || path.startsWith("/work/") || path.startsWith("/blog/"));
  expect(paths.length).toBeGreaterThan(2);

  for (const path of paths) {
    await page.goto(path);
    await expect
      .soft(page.locator("aside").getByRole("link", { name: /book a call/i }), path)
      .toHaveCount(1);
  }
});

test("a hero Book a Call click is recorded and still opens the booking page", async ({
  page,
  baseURL,
}) => {
  test.skip(!isLocalhost(baseURL), LOCAL_ONLY);
  await page.goto("/");
  await waitForHomeHydration(page);
  await page.waitForFunction(() => "gtag" in window);

  const cta = page.locator("#hero").getByRole("link", { name: /book a call/i });
  const bookingHref = await cta.getAttribute("href");
  const popupOpened = page.waitForEvent("popup");
  await cta.click();
  const popup = await popupOpened;
  // The booking page itself is outside the run's network boundary: the
  // attempt to load it proves the tracker did not cancel the navigation.
  await expect.poll(() => blocked.some((url) => url === bookingHref)).toBe(true);
  await popup.close();

  expect(await gtagEvents(page)).toContainEqual({
    name: "book_call_click",
    params: { placement: "hero", path: "/" },
  });
});

test("opening the chat is recorded", async ({ page, baseURL }) => {
  test.skip(!isLocalhost(baseURL), LOCAL_ONLY);
  await page.goto("/");
  await waitForHomeHydration(page);
  await page.waitForFunction(() => "gtag" in window);

  await page.getByRole("button", { name: "Open Amin AI chat" }).click();
  await expect
    .poll(() => gtagEvents(page))
    .toContainEqual({ name: "chat_open", params: { path: "/" } });
});

test("poking the hero photo makes it wince, then recover", async ({ page }) => {
  await page.goto("/");
  await waitForHomeHydration(page);

  const button = page.getByRole("button", { name: "Poke Amin's photo" });
  const photo = button.locator("xpath=..");
  await expect(photo).toHaveAttribute("data-state", "idle");
  await button.click();
  await expect(photo).toHaveAttribute("data-state", "ouch");
  await expect(page.getByRole("status").filter({ hasText: "Ouch!" })).toBeAttached();
  await expect(photo).toHaveAttribute("data-state", "idle", { timeout: 5_000 });
});

test.describe("at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("landing pages never scroll sideways", async ({ page, request }) => {
    const firstPost = (await sitemapUrls(request)).map(pathOf).find((p) => p.startsWith("/blog/"));
    for (const path of ["/", "/games", "/work", "/work/caramel", "/reviews", firstPost!]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect.soft(overflow, `${path} horizontal overflow (px)`).toBeLessThanOrEqual(0);
    }
  });

  test("at the end of a page the chat launcher covers none of its content", async ({
    page,
    request,
  }) => {
    const firstPost = (await sitemapUrls(request)).map(pathOf).find((p) => p.startsWith("/blog/"));
    for (const path of ["/", "/work", "/work/caramel", "/reviews", firstPost!]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Open Amin AI chat" })).toBeVisible();
      // Polled: late images can still grow the page after the first scroll.
      await expect.poll(() => contentUnderLauncher(page), { message: path }).toEqual([]);
    }
  });

  test("an FAQ answer opens on tap", async ({ page }) => {
    await page.goto("/");
    const first = page.locator("#faq details").first();
    await first.locator("summary").scrollIntoViewIfNeeded();
    await first.locator("summary").tap();
    await expect(first).toHaveAttribute("open", "");
    await expect(first.locator("p")).toBeVisible();
  });
});
