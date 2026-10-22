import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  GAME_OVER_JINGLE,
  LEVEL_WIN_JINGLE,
  MUSIC_INTRO,
  MUSIC_LOOP,
  MUSIC_SEQUENCE,
} from "../music";

const BASE = "/games/super-voltorb-flip/audio/";

describe("background music", () => {
  it("plays the original intro once, then the original loop, at every level", () => {
    expect(MUSIC_INTRO.src).toBe(`${BASE}music_intro.mp3`);
    expect(MUSIC_LOOP.src).toBe(`${BASE}music_loop.mp3`);
    expect(MUSIC_SEQUENCE).toEqual([MUSIC_INTRO, MUSIC_LOOP]);
  });

  it("maps the round-cleared and round-lost jingles to the original files", () => {
    expect(LEVEL_WIN_JINGLE.src).toBe(`${BASE}music_level_win.mp3`);
    expect(GAME_OVER_JINGLE.src).toBe(`${BASE}game_over.mp3`);
  });

  it("keeps volumes audible and below full scale", () => {
    for (const track of [MUSIC_INTRO, MUSIC_LOOP, LEVEL_WIN_JINGLE, GAME_OVER_JINGLE]) {
      expect(track.volume).toBeGreaterThan(0.05);
      expect(track.volume).toBeLessThanOrEqual(0.6);
    }
  });

  it("only names files that exist under public/", () => {
    for (const track of [MUSIC_INTRO, MUSIC_LOOP, LEVEL_WIN_JINGLE, GAME_OVER_JINGLE]) {
      expect(existsSync(join(process.cwd(), "public", track.src))).toBe(true);
    }
  });
});
