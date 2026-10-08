import { describe, it, expect } from "vitest";
import type { EngineEvent } from "../../engine/types";
import {
  COMBO_TEXT_FILL,
  POPUP_FILLS,
  SHAKE_MAX_PX,
  TEXT_OUTLINE_ALPHA,
  TEXT_OUTLINE_RGB,
  composite,
  contrastRatio,
  hitStopMs,
  popupFor,
  shakeFor,
} from "../juice";
import { CORE_FILL, PALETTE, RAINBOW_FILL } from "../paint";

function clearEvent(points: number, combo: number): EngineEvent {
  return {
    type: "clear",
    cells: [
      { side: 4, row: 2 },
      { side: 4, row: 1 },
      { side: 5, row: 1 },
    ],
    count: 3,
    colour: 1,
    combo,
    chain: false,
    points,
  };
}

describe("shakeFor", () => {
  it("does not shake below 3 cells, then grows with the clear up to a cap", () => {
    for (const cells of [0, 1, 2]) {
      expect(shakeFor(cells, false)).toBe(0);
      expect(shakeFor(cells, true)).toBe(0);
    }
    let previous = 0;
    for (let cells = 3; cells <= 7; cells++) {
      const shake = shakeFor(cells, false);
      expect(shake).toBeGreaterThan(previous);
      previous = shake;
    }
    expect(shakeFor(3, true)).toBeGreaterThan(shakeFor(3, false));
    expect(shakeFor(40, false)).toBe(SHAKE_MAX_PX);
    expect(shakeFor(40, true)).toBe(SHAKE_MAX_PX);
  });
});

describe("hitStopMs", () => {
  it("is 0, 60 or 90 ms, the engine's own rule", () => {
    expect(hitStopMs(3, false)).toBe(0);
    expect(hitStopMs(5, false)).toBe(60);
    expect(hitStopMs(3, true)).toBe(90);
  });
});

describe("popupFor", () => {
  it("shows +N on the landed cell for a clear that scored", () => {
    expect(popupFor(clearEvent(9, 1))).toEqual({
      text: "+9",
      scale: 1,
      fill: POPUP_FILLS[0],
      side: 4,
      row: 2,
    });
  });

  it("grows with the combo, up to twice the size, and warms its colour", () => {
    const scales = [1, 2, 3, 5, 8, 20].map((combo) => popupFor(clearEvent(10, combo))?.scale);
    expect(scales[0]).toBe(1);
    for (let i = 1; i < 5; i++) expect(scales[i]).toBeGreaterThan(scales[i - 1] ?? Infinity);
    expect(scales[5]).toBe(2);
    expect(popupFor(clearEvent(10, 2))?.fill).toBe(POPUP_FILLS[1]);
    expect(popupFor(clearEvent(10, 4))?.fill).toBe(POPUP_FILLS[2]);
    expect(popupFor(clearEvent(10, 9))?.fill).toBe(POPUP_FILLS[3]);
  });

  it("shows nothing for a clear that scored 0 or an event that is not a score", () => {
    expect(popupFor(clearEvent(0, 1))).toBeNull();
    expect(popupFor({ type: "gravity" })).toBeNull();
    expect(popupFor({ type: "panic", cells: 20, points: 600 })).toBeNull();
  });

  it("shows a clean sweep's bonus a row above, at full size", () => {
    const popup = popupFor({
      type: "clean-sweep",
      cells: [{ side: 2, row: 0 }],
      combo: 3,
      points: 3000,
    });
    expect(popup).toMatchObject({ text: "+3000", scale: 2, side: 2, row: 1 });
  });
});

describe("contrastRatio", () => {
  it("follows the WCAG formula", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 6);
    expect(contrastRatio("#4fb3bf", "#4fb3bf")).toBe(1);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#ffffff", "#777777")).toBe(contrastRatio("#777777", "#ffffff"));
    expect(() => contrastRatio("red", "#000000")).toThrow();
  });

  it("composites a colour at an alpha over another as a canvas does", () => {
    expect(composite("#000000", 0.85, "#ffffff")).toBe("#262626");
    expect(composite("#ff0000", 1, "#00ff00")).toBe("#ff0000");
    expect(composite("#ff0000", 0, "#00ff00")).toBe("#00ff00");
  });

  it("keeps every popup and combo colour at 4.5:1 or more inside its outline, on any background", () => {
    // Text can sit over the core, any cell, or the page around the board, light or dark.
    const backgrounds = [CORE_FILL, ...PALETTE, RAINBOW_FILL, "#ffffff", "#000000"];
    for (const fill of [COMBO_TEXT_FILL, ...POPUP_FILLS]) {
      for (const bg of backgrounds) {
        const outline = composite(TEXT_OUTLINE_RGB, TEXT_OUTLINE_ALPHA, bg);
        expect(contrastRatio(fill, outline), `${fill} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
