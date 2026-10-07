import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { MUSIC_BANDS, musicTrackForLevel } from "../music";

const BASE = "/games/super-voltorb-flip/music/";

describe("musicTrackForLevel", () => {
  it("plays rookie on levels 1-3, veteran on 4-6, master on 7-8", () => {
    for (const level of [1, 2, 3]) expect(musicTrackForLevel(level).src).toBe(`${BASE}rookie.mp3`);
    for (const level of [4, 5, 6]) expect(musicTrackForLevel(level).src).toBe(`${BASE}veteran.mp3`);
    for (const level of [7, 8]) expect(musicTrackForLevel(level).src).toBe(`${BASE}master.mp3`);
  });

  it("clamps out-of-range and non-finite levels", () => {
    expect(musicTrackForLevel(9).src).toBe(`${BASE}master.mp3`);
    expect(musicTrackForLevel(500).src).toBe(`${BASE}master.mp3`);
    expect(musicTrackForLevel(0).src).toBe(`${BASE}rookie.mp3`);
    expect(musicTrackForLevel(-4).src).toBe(`${BASE}rookie.mp3`);
    expect(musicTrackForLevel(Number.NaN).src).toBe(`${BASE}rookie.mp3`);
  });

  it("keeps volumes audible and below full scale", () => {
    for (const band of MUSIC_BANDS) {
      expect(band.track.volume).toBeGreaterThan(0.05);
      expect(band.track.volume).toBeLessThanOrEqual(0.6);
    }
  });

  it("only names files that exist under public/", () => {
    for (const band of MUSIC_BANDS) {
      expect(existsSync(join(process.cwd(), "public", band.track.src))).toBe(true);
    }
  });

  it("orders the bands by their ceilings", () => {
    const ceilings = MUSIC_BANDS.map((b) => b.maxLevel);
    expect([...ceilings].sort((a, b) => a - b)).toEqual(ceilings);
    expect(ceilings[ceilings.length - 1]).toBe(Number.POSITIVE_INFINITY);
  });
});
