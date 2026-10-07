import { describe, expect, it } from "vitest";
import { KEYBOARD_MIN_PX, computeViewportLayout } from "../viewport-layout";

describe("computeViewportLayout", () => {
  it("no keyboard: the sheet is the whole visual viewport", () => {
    expect(computeViewportLayout({ baselineHeight: 844, vvHeight: 844, vvOffsetTop: 0 })).toEqual({
      keyboardOpen: false,
      height: 844,
      top: 0,
    });
  });

  it("keyboard open: the sheet shrinks to the visible area above the keyboard", () => {
    const l = computeViewportLayout({ baselineHeight: 844, vvHeight: 500, vvOffsetTop: 0 });
    expect(l).toEqual({ keyboardOpen: true, height: 500, top: 0 });
  });

  it("follows the visual viewport offset (iOS scrolls the layout viewport under the keyboard)", () => {
    const l = computeViewportLayout({ baselineHeight: 844, vvHeight: 500, vvOffsetTop: 120 });
    expect(l.top).toBe(120);
  });

  it("a small shrink (URL bar collapse) is not a keyboard", () => {
    const l = computeViewportLayout({
      baselineHeight: 844,
      vvHeight: 844 - (KEYBOARD_MIN_PX - 1),
      vvOffsetTop: 0,
    });
    expect(l.keyboardOpen).toBe(false);
  });

  it("clamps nonsense input", () => {
    const l = computeViewportLayout({ baselineHeight: 0, vvHeight: -5, vvOffsetTop: -3 });
    expect(l.height).toBeGreaterThanOrEqual(0);
    expect(l.top).toBeGreaterThanOrEqual(0);
  });
});
