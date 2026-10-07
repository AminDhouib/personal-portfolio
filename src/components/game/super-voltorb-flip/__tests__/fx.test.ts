import { describe, it, expect } from "vitest";
import {
  BURST_BOX,
  BURST_FRAMES,
  COIN_FRAMES,
  SPARKLE_BOX,
  SPARKLE_FRAMES,
  burstRects,
  coinHalfWidth,
  sparkleRects,
  type Rect,
} from "../art/fx";

function inside(rects: Rect[], box: number): boolean {
  return rects.every(
    (r) => r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= box && r.y + r.h <= box,
  );
}

describe("burstRects", () => {
  it("has the frame count the callers loop over", () => {
    expect(BURST_FRAMES).toBe(9);
  });

  it("keeps every frame inside the 64 x 64 box", () => {
    for (let f = 0; f < BURST_FRAMES; f++) expect(inside(burstRects(f), BURST_BOX)).toBe(true);
  });

  it("grows outward: later frames reach farther from the centre than the first", () => {
    const reach = (rects: Rect[]) =>
      Math.max(
        ...rects.map((r) => Math.max(Math.abs(r.x + r.w / 2 - 32), Math.abs(r.y + r.h / 2 - 32))),
      );
    expect(reach(burstRects(BURST_FRAMES - 1))).toBeGreaterThan(reach(burstRects(0)) + 15);
  });

  it("starts with a flash, ends without one, and adds the second ring from frame 2", () => {
    expect(burstRects(0).length).toBe(10); // two flash bars + eight shards
    expect(burstRects(1).length).toBe(10);
    expect(burstRects(2).length).toBe(18); // + eight ring shards
    expect(burstRects(BURST_FRAMES - 1).length).toBe(16); // no flash
  });

  it("clamps out-of-range frames instead of throwing", () => {
    expect(burstRects(-3)).toEqual(burstRects(0));
    expect(burstRects(99)).toEqual(burstRects(BURST_FRAMES - 1));
  });
});

describe("sparkleRects", () => {
  it("has 4 frames, all inside the 32 x 32 box", () => {
    expect(SPARKLE_FRAMES).toBe(4);
    for (let f = 0; f < SPARKLE_FRAMES; f++)
      expect(inside(sparkleRects(f), SPARKLE_BOX)).toBe(true);
  });

  it("swells to a peak then recedes", () => {
    const arm = (f: number) => Math.max(...sparkleRects(f).map((r) => r.w));
    expect(arm(2)).toBeGreaterThan(arm(0));
    expect(arm(3)).toBeLessThan(arm(2));
  });
});

describe("coinHalfWidth", () => {
  it("turns face-on, edge-on, face-on over the 12 frames", () => {
    expect(COIN_FRAMES).toBe(12);
    expect(coinHalfWidth(0)).toBe(7);
    expect(coinHalfWidth(6)).toBe(7);
    expect(coinHalfWidth(3)).toBe(1);
    expect(coinHalfWidth(9)).toBe(1);
  });

  it("never collapses to nothing and never exceeds the coin radius", () => {
    for (let f = 0; f < COIN_FRAMES; f++) {
      expect(coinHalfWidth(f)).toBeGreaterThanOrEqual(1);
      expect(coinHalfWidth(f)).toBeLessThanOrEqual(7);
    }
  });
});
