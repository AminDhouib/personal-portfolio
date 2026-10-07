import { expect, test } from "@playwright/test";
import { blockThirdParties } from "./helpers";

// The Voltorb Flip board on a phone and from a keyboard, measured in a real
// browser against the production build: 44px tiles and memo buttons, no
// horizontal overflow, and a working arrow-key path.

const GAME_PATH = "/games/super-voltorb-flip";
const FIRST_TILE = "Row 1, Col 1, face down";

for (const width of [360, 390]) {
  test(`phone layout at ${width}px: 44px tiles and memo buttons, no overflow`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    await blockThirdParties(context, baseURL);
    const page = await context.newPage();
    try {
      await page.goto(GAME_PATH);
      await expect(page.getByRole("button", { name: FIRST_TILE })).toBeVisible({
        timeout: 20_000,
      });

      // The role=button wrapper is exactly var(--svf-tile) (border-box, no border of
      // its own); the visible face inside it is 4px larger, so this is the stricter
      // measure and is the touch target.
      const tiles = await page
        .getByRole("button", { name: /^Row \d, Col \d, face down/ })
        .evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return [r.width, r.height];
          }),
        );
      expect(tiles).toHaveLength(25);
      for (const [w, h] of tiles) {
        expect(w).toBeGreaterThanOrEqual(44);
        expect(h).toBeGreaterThanOrEqual(44);
      }

      // The phone and desktop memo bars both exist; only the visible one counts.
      const memo = await page.getByRole("group", { name: "Memo flags" }).evaluateAll((groups) =>
        groups
          .filter((g) => (g as HTMLElement).offsetParent !== null)
          .flatMap((g) =>
            Array.from(g.querySelectorAll("button")).map((b) => {
              const r = b.getBoundingClientRect();
              return [r.width, r.height];
            }),
          ),
      );
      expect(memo).toHaveLength(5);
      for (const [w, h] of memo) {
        expect(w).toBeGreaterThanOrEqual(44);
        expect(h).toBeGreaterThanOrEqual(44);
      }

      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
        frameRight: document.querySelector(".svf-board-frame")?.getBoundingClientRect().right ?? 0,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.inner);
      expect(overflow.frameRight).toBeLessThanOrEqual(overflow.inner);
    } finally {
      await context.close();
    }
  });
}

test("keyboard: arrows move the cursor and a number key marks the tile", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await blockThirdParties(context, baseURL);
  const page = await context.newPage();
  try {
    await page.goto(GAME_PATH);
    const first = page.getByRole("button", { name: FIRST_TILE });
    await expect(first).toBeVisible({ timeout: 20_000 });

    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "Row 1, Col 2, face down" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("button", { name: "Row 2, Col 2, face down" })).toBeFocused();

    await page.keyboard.press("2");
    await expect(
      page.getByRole("button", { name: "Row 2, Col 2, face down, memo 2" }),
    ).toBeFocused();
  } finally {
    await context.close();
  }
});
