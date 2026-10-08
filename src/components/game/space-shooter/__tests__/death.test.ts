import { describe, it, expect } from "vitest";
import { deathTimeScale, HIT_STOP_MS, SLOW_MO_MS, SLOW_MO_SCALE } from "../death";

describe("deathTimeScale", () => {
  it("freezes the simulation for the hit-stop", () => {
    expect(HIT_STOP_MS).toBe(90);
    expect(deathTimeScale(0)).toBe(0);
    expect(deathTimeScale(89)).toBe(0);
  });

  it("runs slow-motion for 400 ms after the hit-stop", () => {
    expect(SLOW_MO_SCALE).toBe(0.35);
    expect(SLOW_MO_MS).toBe(400);
    expect(deathTimeScale(90)).toBe(0.35);
    expect(deathTimeScale(489)).toBe(0.35);
  });

  it("returns to normal speed after the beat", () => {
    expect(deathTimeScale(490)).toBe(1);
    expect(deathTimeScale(5000)).toBe(1);
  });

  it("treats a negative age as frozen", () => {
    expect(deathTimeScale(-5)).toBe(0);
  });
});
