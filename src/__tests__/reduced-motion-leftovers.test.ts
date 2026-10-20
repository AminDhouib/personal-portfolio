import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Source pins for two CSS-only reduced-motion gates (T-4599). The Hextris rotation snap is pinned
// in hextris/render/__tests__/paint.test.ts.
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("reduced-motion leftovers", () => {
  it("only zooms a Work thumbnail on hover when motion is allowed", () => {
    const work = read("src/components/sections/work.tsx");
    expect(work).toContain("motion-safe:group-hover:scale-105");
    expect(work).not.toMatch(/(?<!motion-safe:)group-hover:scale-105/);
  });

  it("opens the chat popup in place, fading only, under reduced motion", () => {
    const css = read("src/app/globals.css");
    const block =
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.copilotKitWindow,\s*\.copilotKitWindow\.open \{([^}]*)\}/.exec(
        css,
      );
    expect(block).not.toBeNull();
    expect(block?.[1]).toContain("transform: none !important");
    expect(block?.[1]).toContain("transition-property: opacity !important");
  });
});
