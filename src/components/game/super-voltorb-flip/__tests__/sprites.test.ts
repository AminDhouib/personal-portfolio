import { describe, it, expect } from "vitest";
import {
  GLYPHS,
  GLYPH_1,
  GLYPH_2,
  GLYPH_3,
  GLYPH_CLEAR,
  ORB,
  PALETTE,
  spritePaths,
  spriteRuns,
  type Sprite,
} from "../art/sprites";

const ALL: [string, Sprite][] = [
  ["ORB", ORB],
  ["GLYPH_1", GLYPH_1],
  ["GLYPH_2", GLYPH_2],
  ["GLYPH_3", GLYPH_3],
  ["GLYPH_CLEAR", GLYPH_CLEAR],
];

describe("sprites", () => {
  it.each(ALL)("%s is rectangular and uses only palette characters", (_name, sprite) => {
    const width = sprite[0]!.length;
    expect(sprite.length).toBeGreaterThan(0);
    for (const row of sprite) {
      expect(row).toHaveLength(width);
      for (const ch of row) expect(ch === "." || ch in PALETTE).toBe(true);
    }
  });

  it("ORB is an 11 x 11 sphere with a symmetric silhouette", () => {
    expect(ORB).toHaveLength(11);
    const silhouette = ORB.map((row) => [...row].map((c) => (c === "." ? "." : "#")).join(""));
    for (const row of silhouette) expect(row).toBe([...row].reverse().join(""));
    expect(silhouette).toEqual([...silhouette].reverse());
  });

  it("glyph digits are 5 x 7 and the clear mark is 7 x 7", () => {
    for (const g of [GLYPH_1, GLYPH_2, GLYPH_3]) {
      expect(g).toHaveLength(7);
      expect(g[0]).toHaveLength(5);
    }
    expect(GLYPH_CLEAR).toHaveLength(7);
    expect(GLYPH_CLEAR[0]).toHaveLength(7);
  });

  it("maps each memo flag to a sprite, with V as the orb", () => {
    expect(GLYPHS.V).toBe(ORB);
    expect(GLYPHS[1]).toBe(GLYPH_1);
    expect(GLYPHS[2]).toBe(GLYPH_2);
    expect(GLYPHS[3]).toBe(GLYPH_3);
  });
});

describe("spriteRuns / spritePaths", () => {
  it("covers exactly the non-transparent cells", () => {
    for (const [, sprite] of ALL) {
      const filled = sprite.reduce((n, row) => n + [...row].filter((c) => c !== ".").length, 0);
      const covered = spriteRuns(sprite).reduce((n, run) => n + run.w, 0);
      expect(covered).toBe(filled);
    }
  });

  it("merges horizontal neighbours of one colour into a single run", () => {
    expect(spriteRuns(["ooh"])).toEqual([
      { color: PALETTE.o, x: 0, y: 0, w: 2 },
      { color: PALETTE.h, x: 2, y: 0, w: 1 },
    ]);
  });

  it("groups paths by colour", () => {
    const paths = spritePaths(ORB);
    const colors = paths.map((p) => p.color);
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors).toContain(PALETTE.y);
    for (const p of paths) expect(p.d.startsWith("M")).toBe(true);
  });

  it("rejects characters outside the palette", () => {
    expect(() => spriteRuns(["?"])).toThrow(/unknown sprite character/i);
  });
});
