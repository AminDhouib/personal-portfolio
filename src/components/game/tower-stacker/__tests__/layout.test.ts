// @vitest-environment node
import { describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "../engine";
import { stageLayout } from "../layout";

describe("stageLayout", () => {
  it("fits 440 x 660 under the fold at 1440 x 900", () => {
    const l = stageLayout({ containerWidth: 1000, viewportHeight: 900, sheet: false });
    expect(l).toEqual({ cssWidth: 440, cssHeight: 660, scale: 440 / WORLD_WIDTH });
    expect(l.scale).toBeCloseTo(0.7333, 4);
  });

  it("fills a phone-width page column at 3:2", () => {
    const l = stageLayout({ containerWidth: 358, viewportHeight: 844, sheet: false });
    expect(l.cssWidth).toBe(358);
    expect(l.cssHeight).toBe(537);
  });

  it("takes the whole screen in the play sheet", () => {
    const l = stageLayout({ containerWidth: 390, viewportHeight: 844, sheet: true });
    expect(l).toEqual({ cssWidth: 390, cssHeight: 844, scale: 0.65 });
  });

  it("never goes below 280 wide, and keeps a 420 floor on height", () => {
    expect(stageLayout({ containerWidth: 260, viewportHeight: 900, sheet: false }).cssWidth).toBe(
      280,
    );
    expect(stageLayout({ containerWidth: 440, viewportHeight: 500, sheet: false }).cssHeight).toBe(
      420,
    );
  });
});
