import { expect, test } from "@playwright/test";
import { blockThirdParties } from "./helpers";

// Largest Contentful Paint of the Voltorb Flip game page on a phone, measured
// in a real browser: when it happened and WHICH element it was. The page
// server-renders its heading and copy; the game itself is a client-only chunk
// behind a text-free placeholder, so the question is whether the game ever
// becomes the LCP.

const GAME_PATH = "/games/super-voltorb-flip";

type LcpRecord = { startTime: number; tag: string | null; inGame: boolean; text: string };

declare global {
  interface Window {
    __lcp: LcpRecord[];
  }
}

test("LCP of the game page is page content, not the game, and lands inside the budget", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await blockThirdParties(context, baseURL);
  await context.addInitScript(() => {
    const store = window;
    store.__lcp = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const el = (entry as PerformanceEntry & { element?: Element | null }).element;
        store.__lcp.push({
          startTime: entry.startTime,
          tag: el?.tagName ?? null,
          inGame: Boolean(el?.closest(".svf-root")),
          text: (el?.textContent ?? "").trim().slice(0, 40),
        });
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  const page = await context.newPage();
  try {
    await page.goto(GAME_PATH);
    await expect(page.getByRole("button", { name: "Row 1, Col 1, face down" })).toBeVisible({
      timeout: 20_000,
    });
    // Let late paints land; LCP entries stop at the first input, and we send none.
    await expect.poll(() => page.evaluate(() => document.readyState)).toBe("complete");
    await page.waitForTimeout(2_000);

    const records = await page.evaluate(() => window.__lcp);
    const last = records[records.length - 1];
    expect(last, "the browser reported no LCP entry").toBeDefined();
    test.info().annotations.push({ type: "lcp", description: JSON.stringify(records) });
    process.stdout.write(`LCP ${GAME_PATH}: ${JSON.stringify(records)}
`);
    expect(last?.inGame, "the game became the largest paint").toBe(false);
    // A budget with headroom for a CI runner on an unthrottled local server: it
    // exists to catch a regression of seconds, not to benchmark.
    expect(last?.startTime ?? Infinity).toBeLessThan(4_000);
  } finally {
    await context.close();
  }
});
