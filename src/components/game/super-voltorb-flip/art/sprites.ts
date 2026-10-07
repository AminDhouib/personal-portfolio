// Original pixel art for Super Voltorb Flip, drawn as text. One character is
// one pixel; "." is transparent. PixelSprite renders a sprite as inline SVG,
// so nothing here is a binary asset and nothing is copied from any game.
// The orb is our own design (an indigo sphere with a lightning bolt), not the
// Pokemon creature. To redraw it, edit the strings and keep the grid size.

export type Sprite = readonly string[];

export const PALETTE: Record<string, string> = {
  o: "#16213e", // outline
  d: "#2b3f8f", // shadow side
  b: "#3e63d8", // body
  h: "#8fb4ff", // highlight
  y: "#ffc933", // bolt
  w: "#fff3b0", // bolt core
  k: "currentColor", // glyph ink: takes the surrounding CSS colour
};

export const ORB: Sprite = [
  "...ooooo...",
  "..ohhbbbo..",
  ".ohhbbywbo.",
  ".ohbbywbbo.",
  "ohbyywwybdo",
  "obbbbwybbdo",
  "obbbwybbbdo",
  ".obywbbbdo.",
  ".obbbbbddo.",
  "..odddddo..",
  "...ooooo...",
];

export const GLYPH_1: Sprite = ["..k..", ".kk..", "..k..", "..k..", "..k..", "..k..", ".kkk."];

export const GLYPH_2: Sprite = [".kkk.", "k...k", "....k", "...k.", "..k..", ".k...", "kkkkk"];

export const GLYPH_3: Sprite = [".kkk.", "k...k", "....k", "..kk.", "....k", "k...k", ".kkk."];

/** The memo Clear mark: a plain X. */
export const GLYPH_CLEAR: Sprite = [
  "k.....k",
  ".k...k.",
  "..k.k..",
  "...k...",
  "..k.k..",
  ".k...k.",
  "k.....k",
];

/** The memo Undo mark: an arrow that turns back on itself. */
export const GLYPH_UNDO: Sprite = [
  "..k....",
  ".kk....",
  "kkkkkk.",
  ".kk...k",
  "..k...k",
  ".....k.",
  "..kkk..",
];

/** Sprite for each memo flag; "V" (Voltorb) is the orb itself. */
export const GLYPHS = { 1: GLYPH_1, 2: GLYPH_2, 3: GLYPH_3, V: ORB } as const;

export interface Run {
  color: string;
  x: number;
  y: number;
  w: number;
}

/** Horizontal runs of identical characters, in reading order. */
export function spriteRuns(sprite: Sprite): Run[] {
  const runs: Run[] = [];
  sprite.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      if (ch === ".") {
        x++;
        continue;
      }
      const color = PALETTE[ch];
      if (color === undefined) throw new Error(`Unknown sprite character "${ch}"`);
      let w = 1;
      while (row[x + w] === ch) w++;
      runs.push({ color, x, y, w });
      x += w;
    }
  });
  return runs;
}

/** One SVG path per colour: every run becomes a 1-high rectangle subpath. */
export function spritePaths(sprite: Sprite): { color: string; d: string }[] {
  const byColor = new Map<string, string>();
  for (const run of spriteRuns(sprite)) {
    const piece = `M${run.x} ${run.y}h${run.w}v1h-${run.w}z`;
    byColor.set(run.color, (byColor.get(run.color) ?? "") + piece);
  }
  return [...byColor].map(([color, d]) => ({ color, d }));
}
