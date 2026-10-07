import { describe, it, expect } from "vitest";
import {
  BOARD_FRAME_CSS,
  DESKTOP_GAP_RATIO,
  MIN_TOUCH_PX,
  PHONE_GAP_RATIO,
  PHONE_MAX_VIEWPORT_PX,
  PHONE_MIN_SUPPORTED_VIEWPORT_PX,
  phoneTilePx,
} from "../board-size";

describe("phoneTilePx", () => {
  it("gives a 5x5 board tiles of at least 44px on every supported phone width", () => {
    for (let width = PHONE_MIN_SUPPORTED_VIEWPORT_PX; width <= PHONE_MAX_VIEWPORT_PX; width += 1) {
      expect(phoneTilePx(width, 5)).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
    }
  });

  it("matches the worked figures at 360, 390 and the 380px frame cap", () => {
    expect(phoneTilePx(360, 5)).toBeCloseTo(44.57, 1);
    expect(phoneTilePx(390, 5)).toBeCloseTo(48.86, 1);
    expect(phoneTilePx(600, 5)).toBeCloseTo(49.71, 1);
  });

  it("never exceeds the tile cap", () => {
    expect(phoneTilePx(639, 2)).toBeLessThanOrEqual(72);
  });
});

describe("BOARD_FRAME_CSS", () => {
  it("uses the tighter gap ratio on phones and the original 0.28 from sm up", () => {
    expect(PHONE_GAP_RATIO).toBe(0.2);
    expect(DESKTOP_GAP_RATIO).toBe(0.28);
    const phoneRule = BOARD_FRAME_CSS.split("@media")[0] ?? "";
    expect(phoneRule).toContain("--svf-ratio: 0.2;");
    expect(BOARD_FRAME_CSS).toContain("@media (min-width: 640px)");
    expect(BOARD_FRAME_CSS.split("@media (min-width: 640px)")[1]).toContain("--svf-ratio: 0.28;");
  });

  it("keeps the desktop frame widths", () => {
    expect(BOARD_FRAME_CSS).toContain("width: min(92vw, 460px, var(--svf-max-cap));");
    expect(BOARD_FRAME_CSS).toContain("width: min(60vw, 560px, var(--svf-max-cap));");
  });
});
