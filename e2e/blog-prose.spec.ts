import { expect, test } from "@playwright/test";
import { blockThirdParties } from "./helpers";

// Blog prose rendering, read off the running production build.

test("inline code in blog prose draws no typography backtick pseudo-content", async ({
  page,
  context,
  baseURL,
}) => {
  await blockThirdParties(context, baseURL);
  await page.goto("/blog/quality-gates-that-earn-their-keep");

  const inlineCode = page.locator(".prose code:not(pre code)");
  expect(await inlineCode.count()).toBeGreaterThan(0);

  const contents = await inlineCode.evaluateAll((els) =>
    els.map((el) => ({
      before: getComputedStyle(el, "::before").content,
      after: getComputedStyle(el, "::after").content,
    })),
  );
  for (const { before, after } of contents) {
    expect(["none", "normal"]).toContain(before);
    expect(["none", "normal"]).toContain(after);
  }
});
