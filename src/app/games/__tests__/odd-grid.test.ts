// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The "Other games" grid sits in an async server page, so its class is pinned from the
// source: an odd count must not leave a lone card in a two-column grid.
describe("the [slug] page Other games grid", () => {
  it("lets a lone last card span the row", () => {
    const source = readFileSync(join(process.cwd(), "src/app/games/[slug]/page.tsx"), "utf8");
    expect(source).toContain("sm:[&>*:last-child:nth-child(odd)]:col-span-2");
  });
});
