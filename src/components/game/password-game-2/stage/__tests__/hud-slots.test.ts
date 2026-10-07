import { describe, expect, it } from "vitest";
import { HUD_BOTTOM_H, HUD_TOP_H, hudSlots } from "../hud-slots";

const box = { x: 20, y: 80, w: 520, h: 160 };

describe("hudSlots", () => {
  it("places the top zone directly above the box and the bottom zone directly below", () => {
    const s = hudSlots({ boxRect: box })!;
    expect(s.top).toEqual({ x: 20, y: 80 - HUD_TOP_H, w: 520, h: HUD_TOP_H });
    expect(s.bottom).toEqual({ x: 20, y: 240, w: 520, h: HUD_BOTTOM_H });
  });

  it("never overlaps the box", () => {
    const s = hudSlots({ boxRect: box })!;
    expect(s.top.y + s.top.h).toBeLessThanOrEqual(box.y);
    expect(s.bottom.y).toBeGreaterThanOrEqual(box.y + box.h);
  });

  it("splits the top zone into a left meter slot and a right chip slot", () => {
    const s = hudSlots({ boxRect: box })!;
    expect(s.meter.x).toBe(s.top.x);
    expect(s.chips.x + s.chips.w).toBe(s.top.x + s.top.w);
    expect(s.meter.x + s.meter.w).toBeLessThanOrEqual(s.chips.x);
  });

  it("returns null slots when there is no box yet", () => {
    expect(hudSlots({ boxRect: null })).toBeNull();
  });
});
