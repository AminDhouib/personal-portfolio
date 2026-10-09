import { describe, it, expect } from "vitest";
import { boardState } from "../../engine/__tests__/boards";
import { rotate } from "../../engine/step";
import type { RunState } from "../../engine/types";
import {
  COMBO_TEXT_FILL,
  POPUP_MS,
  TEXT_OUTLINE_PX,
  TEXT_OUTLINE_STYLE,
  type ShownPopup,
} from "../juice";
import { START_LIMIT_ROWS } from "../../engine/state";
import { layout, ringRadius } from "../layout";
import {
  COMBO_STROKE,
  LIMIT_STROKE,
  LIMIT_WARN_STROKE,
  PALETTE,
  RAINBOW_FILL,
  paint,
  type PaintEnding,
} from "../paint";
import { makeFakeCtx2D, type FakeCtx2D, type Point } from "./fake-ctx";

function painted(
  s: RunState,
  width = 1440,
  height = 900,
  nowMs = s.elapsedMs,
  popups: readonly ShownPopup[] = [],
): FakeCtx2D {
  const ctx = makeFakeCtx2D();
  paint(ctx, s, layout(width, height, false), nowMs, popups);
  return ctx;
}

/** A fingerprint of everything a paint call drew, in order, to pin the output exactly. */
function fingerprint(ctx: FakeCtx2D): string {
  const json = JSON.stringify(
    {
      cleared: ctx.cleared,
      fills: ctx.fills,
      strokes: ctx.strokes,
      arcs: ctx.arcs,
      texts: ctx.texts,
    },
    (_, v: unknown) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v),
  );
  // FNV-1a, 32 bit.
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${json.length}:${hash.toString(16)}`;
}

/** A busy mid-run board: specials, pieces in flight, a turn easing, the combo up, popups. */
function busyRun(): { s: RunState; popups: ShownPopup[] } {
  const s = boardState({ 0: "aAb", 1: "c*d", 2: "ab", 3: "dd", 5: "bcab" });
  s.falling.push({ id: 1, lane: 2, distance: 6, colour: 3, special: "none" });
  s.falling.push({ id: 2, lane: 4, distance: 9.5, colour: 0, special: "bomb" });
  s.elapsedMs = 5000;
  rotate(s, 1);
  s.combo = 3;
  s.lastClearAtMs = 4900;
  s.comboUntilMs = 7000;
  s.limitRows = 10;
  s.boundaryWarned = true;
  const popups: ShownPopup[] = [
    { text: "+27", scale: 1.4, fill: "#ffe680", side: 1, row: 0, bornMs: 4900 },
    { text: "+9", scale: 1, fill: "#ffffff", side: 3, row: 1, bornMs: 4400 },
  ];
  return { s, popups };
}

function fillCount(ctx: FakeCtx2D, style: string): number {
  return ctx.fills.filter((f) => f.style === style).length;
}

function radii(points: Point[], cx: number, cy: number): number[] {
  return points.map(([x, y]) => Math.hypot(x - cx, y - cy));
}

describe("paint", () => {
  it("fills one polygon per settled cell and per falling piece, in its colour", () => {
    const s = boardState({ 0: "aab", 3: "c*" });
    s.falling.push({ id: 1, lane: 2, distance: 6, colour: 3, special: "none" });
    s.falling.push({ id: 2, lane: 4, distance: 9.5, colour: 0, special: "bomb" });
    const ctx = painted(s);
    expect(fillCount(ctx, PALETTE[0]!)).toBe(3);
    expect(fillCount(ctx, PALETTE[1]!)).toBe(1);
    expect(fillCount(ctx, PALETTE[2]!)).toBe(1);
    expect(fillCount(ctx, PALETTE[3]!)).toBe(1);
    expect(fillCount(ctx, RAINBOW_FILL)).toBe(1);
    const cells = ctx.fills.filter((f) => [...PALETTE, RAINBOW_FILL].includes(f.style));
    for (const cell of cells) expect(cell.points).toHaveLength(4);
  });

  it("draws the limit ring at the current limit, and in the warning colour once warned", () => {
    const s = boardState({});
    const l = layout(1440, 900, false);
    const ring = (ctx: FakeCtx2D, style: string) => ctx.strokes.filter((p) => p.style === style);
    const [full] = ring(painted(s), LIMIT_STROKE);
    expect(full?.points).toHaveLength(6);
    for (const r of radii(full?.points ?? [], l.cx, l.cy)) {
      expect(r).toBeCloseTo(ringRadius(l, 12), 6);
    }
    s.limitRows = 8;
    s.boundaryWarned = true;
    const ctx = painted(s);
    expect(ring(ctx, LIMIT_STROKE)).toEqual([]);
    const [warned] = ring(ctx, LIMIT_WARN_STROKE);
    for (const r of radii(warned?.points ?? [], l.cx, l.cy)) {
      expect(r).toBeCloseTo(ringRadius(l, 8), 6);
    }
  });

  it("draws the combo window ring in proportion to the time left", () => {
    const s = boardState({});
    s.combo = 2;
    s.lastClearAtMs = 1000;
    s.comboUntilMs = 3800;
    const sweep = (nowMs: number) =>
      painted(s, 1440, 900, nowMs)
        .arcs.filter((a) => a.style === COMBO_STROKE)
        .map((a) => a.end - a.start);
    expect(sweep(1000)[0]).toBeCloseTo(2 * Math.PI, 6);
    expect(sweep(2400)[0]).toBeCloseTo(Math.PI, 6);
    expect(sweep(3100)[0]).toBeCloseTo(Math.PI / 2, 6);
    expect(sweep(3800)).toEqual([]);
  });

  it("writes the combo level in the core, outlined, while the window is open", () => {
    const s = boardState({});
    const l = layout(1440, 900, false);
    s.combo = 3;
    s.lastClearAtMs = 1000;
    s.comboUntilMs = 3800;
    const texts = painted(s, 1440, 900, 2000).texts;
    expect(texts.map((t) => [t.kind, t.text])).toEqual([
      ["stroke", "x3"],
      ["fill", "x3"],
    ]);
    const [outline, fill] = texts;
    expect(outline).toMatchObject({ style: TEXT_OUTLINE_STYLE, lineWidth: TEXT_OUTLINE_PX });
    expect(fill).toMatchObject({ style: COMBO_TEXT_FILL, x: l.cx, y: l.cy });
    expect(painted(s, 1440, 900, 3800).texts).toEqual([]);
    s.combo = 1;
    expect(painted(s, 1440, 900, 2000).texts).toEqual([]);
  });

  it("writes each live popup as outlined +N over its cell, rising and fading out", () => {
    const s = boardState({ 2: "a" });
    const l = layout(1440, 900, false);
    const popup: ShownPopup = {
      text: "+18",
      scale: 1,
      fill: "#ffe680",
      side: 2,
      row: 0,
      bornMs: 1000,
    };
    const at = (nowMs: number, popups: ShownPopup[] = [popup]) =>
      painted(s, 1440, 900, nowMs, popups).texts.filter((t) => t.text.startsWith("+"));
    const born = at(1000);
    expect(born.map((t) => [t.kind, t.style])).toEqual([
      ["stroke", TEXT_OUTLINE_STYLE],
      ["fill", "#ffe680"],
    ]);
    expect(born[0]?.lineWidth).toBe(TEXT_OUTLINE_PX);
    expect(born[1]?.alpha).toBe(1);
    // Over the cell: side 2 points along UP + 2 steps, half a row out.
    const angle = -Math.PI / 2 + (2 * Math.PI) / 3;
    const d = l.apothem + 0.5 * l.rowHeight;
    expect(born[1]?.x).toBeCloseTo(l.cx + Math.cos(angle) * d, 6);
    expect(born[1]?.y).toBeCloseTo(l.cy + Math.sin(angle) * d, 6);
    const later = at(1000 + POPUP_MS * 0.9);
    const dist = (t: { x: number; y: number } | undefined) =>
      Math.hypot((t?.x ?? 0) - l.cx, (t?.y ?? 0) - l.cy);
    expect(dist(later[1])).toBeGreaterThan(dist(born[1]));
    expect(later[1]?.alpha).toBeLessThan(0.5);
    expect(at(1000 + POPUP_MS)).toEqual([]);
    expect(at(999)).toEqual([]);
    const sizeOf = (t: { font: string } | undefined) => Number(/(\d+)px/.exec(t?.font ?? "")?.[1]);
    const big = at(1000, [{ ...popup, scale: 2 }]);
    expect(sizeOf(big[1])).toBeGreaterThan(sizeOf(born[1]) * 1.8);
  });

  it("draws no combo ring before the first clear", () => {
    const ctx = painted(boardState({}));
    expect(ctx.arcs.filter((a) => a.style === COMBO_STROKE)).toEqual([]);
  });

  it("draws nothing outside the canvas, even with overflowing stacks and a turn", () => {
    for (const [width, height] of [
      [390, 844],
      [1440, 900],
      [844, 390],
    ] as const) {
      const tall = "abcd".repeat(4).slice(0, 13);
      const s = boardState({ 0: tall, 1: tall, 2: tall, 3: tall, 4: tall, 5: tall });
      // Pieces just above the stacks; a fresh spawn may start beyond the edge (spec 1.4).
      for (let lane = 0; lane < 6; lane++) {
        s.falling.push({ id: lane, lane, distance: 13, colour: 1, special: "none" });
      }
      rotate(s, 1);
      for (const nowMs of [s.elapsedMs, s.elapsedMs + 40]) {
        const ctx = painted(s, width, height, nowMs);
        expect(ctx.fills.length).toBeGreaterThan(6 * 13);
        for (const [x, y] of ctx.touched) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(width);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(height);
        }
      }
    }
  });

  it("clears the canvas first and never touches the run state", () => {
    const s = boardState({ 0: "ab" });
    s.falling.push({ id: 1, lane: 1, distance: 4, colour: 2, special: "rainbow" });
    rotate(s, -1);
    const before = structuredClone(s);
    const ctx = painted(s, 390, 844, s.elapsedMs + 30);
    expect(ctx.cleared).toBe(1);
    expect(s).toEqual(before);
  });

  it("draws exactly what it drew before T5-5 when there is no ending", () => {
    const { s, popups } = busyRun();
    expect([
      fingerprint(painted(s, 1440, 900, 5040, popups)),
      fingerprint(painted(s, 390, 844, 5040, popups)),
    ]).toEqual(["4245:4211d728", "4252:4a0730c9"]);
  });

  it("eases the board between rotations", () => {
    const s = boardState({ 0: "a" });
    const l = layout(1440, 900, false);
    const angleOf = (ctx: FakeCtx2D) => {
      const cell = ctx.fills.find((f) => f.style === PALETTE[0]);
      const [x, y] = (cell?.points ?? []).reduce<Point>(
        (acc, [px, py]) => [acc[0] + px / 4, acc[1] + py / 4],
        [0, 0],
      );
      return Math.atan2(y - l.cy, x - l.cx);
    };
    const still = angleOf(painted(s));
    rotate(s, 1);
    const start = angleOf(painted(s, 1440, 900, s.elapsedMs));
    const later = angleOf(painted(s, 1440, 900, s.elapsedMs + 1000));
    expect(start).toBeCloseTo(still, 6);
    expect(later - still).toBeCloseTo(Math.PI / 3, 6);
  });
});

describe("paint at game over (the ending)", () => {
  const RED = "#ff4d4d";
  const l = layout(1440, 900, false);

  function ended(
    s: RunState,
    ending: PaintEnding,
    nowMs = s.elapsedMs,
    popups: readonly ShownPopup[] = [],
  ): FakeCtx2D {
    const ctx = makeFakeCtx2D();
    paint(ctx, s, l, nowMs, popups, ending);
    return ctx;
  }

  const particles = (ctx: FakeCtx2D) =>
    ctx.arcs.filter((a) => a.style !== COMBO_STROKE && Math.abs(a.r - l.rowHeight / 3) < 1e-9);

  it("draws everything it draws today at 45 percent, over a canvas left clear", () => {
    const { s, popups } = busyRun();
    const base = painted(s, 1440, 900, 5040, popups);
    const ctx = ended(s, { side: 4, newBest: false, sinceMs: 0 }, 5040, popups);
    expect(ctx.cleared).toBe(1);
    const dimmed = <T extends { alpha: number }>(calls: T[]) =>
      calls.map((c) => ({ ...c, alpha: c.alpha * 0.45 }));
    expect(ctx.fills.slice(0, base.fills.length)).toEqual(dimmed(base.fills));
    expect(ctx.strokes.slice(0, base.strokes.length)).toEqual(dimmed(base.strokes));
    expect(ctx.arcs.slice(0, base.arcs.length)).toEqual(dimmed(base.arcs));
    expect(ctx.texts).toEqual(dimmed(base.texts));
    expect(base.texts.length).toBeGreaterThan(2);
  });

  it("fills the overflowed side's band in pulsing red, at its drawn angle, outlined", () => {
    const s = boardState({ 2: "abc", 4: "dd" });
    s.facing = 1;
    const at = (sinceMs: number) => ended(s, { side: 2, newBest: false, sinceMs });
    const ctx = at(0);
    const bands = ctx.fills.filter((f) => f.style === RED);
    expect(bands).toHaveLength(1);
    const [band] = bands;
    expect(band?.alpha).toBeCloseTo(0.55, 9);
    // Side 2 is drawn one step on (facing 1): its normal points UP + 3 steps.
    const angle = -Math.PI / 2 + 3 * (Math.PI / 3);
    const along = (band?.points ?? []).map(
      ([x, y]) => (x - l.cx) * Math.cos(angle) + (y - l.cy) * Math.sin(angle),
    );
    expect(along).toHaveLength(4);
    // From the core's edge out to max(stack 3, limit 12) + 1 = 13 rows.
    expect(along[0]).toBeCloseTo(l.apothem, 6);
    expect(along[1]).toBeCloseTo(l.apothem, 6);
    expect(along[2]).toBeCloseTo(l.apothem + 13 * l.rowHeight, 6);
    expect(along[3]).toBeCloseTo(l.apothem + 13 * l.rowHeight, 6);
    // A 1000 ms cosine from 0.55 down to 0.20 and back.
    const alphaAt = (sinceMs: number) => at(sinceMs).fills.find((f) => f.style === RED)?.alpha;
    expect(alphaAt(500)).toBeCloseTo(0.2, 9);
    expect(alphaAt(250)).toBeCloseTo(0.375, 9);
    expect(alphaAt(1000)).toBeCloseTo(0.55, 9);
    expect(alphaAt(500)).not.toBe(alphaAt(0));
    // The outline: the same band, in red at full opacity, as wide as the limit ring's line.
    const limit = ctx.strokes.find((p) => p.style === LIMIT_STROKE);
    const outline = ctx.strokes.filter((p) => p.style === RED);
    expect(outline).toEqual([
      { style: RED, points: band?.points, alpha: 1, lineWidth: limit?.lineWidth },
    ]);
    // Then the side's own cells again, at full opacity, on top.
    const after = ctx.fills.slice(ctx.fills.indexOf(band!) + 1);
    expect(after.map((f) => [f.style, f.alpha])).toEqual([
      [PALETTE[0], 1],
      [PALETTE[1], 1],
      [PALETTE[2], 1],
    ]);
  });

  it("reaches one row past the stack when the stack is above the limit", () => {
    const s = boardState({ 1: "abcabcabcab" });
    s.limitRows = 8;
    const band = ended(s, { side: 1, newBest: false, sinceMs: 0 }).fills.find(
      (f) => f.style === RED,
    );
    const angle = -Math.PI / 2 + Math.PI / 3;
    const [, , outer] = band?.points ?? [];
    expect((outer![0] - l.cx) * Math.cos(angle) + (outer![1] - l.cy) * Math.sin(angle)).toBeCloseTo(
      l.apothem + 12 * l.rowHeight,
      6,
    );
  });

  it("bursts 36 particles from the core on a new best, on top, for 1200 ms", () => {
    const s = boardState({ 0: "ab" });
    const burst = (sinceMs: number, newBest = true) =>
      particles(ended(s, { side: 0, newBest, sinceMs }));
    const at300 = burst(300);
    expect(at300).toHaveLength(36);
    expect(at300.map((p) => p.style)).toEqual(Array.from({ length: 36 }, (_, i) => PALETTE[i % 4]));
    for (const p of at300) expect(p.alpha).toBe(1);
    // Drawn last, above the board and the red band.
    const ctx = ended(s, { side: 0, newBest: true, sinceMs: 300 });
    expect(ctx.fills.slice(-36).every((f) => f.points.length === 0)).toBe(true);
    // Particle 0 heads straight up, and they fan out 10 degrees apart.
    const dir = (p: { x: number; y: number }) => Math.atan2(p.y - l.cy, p.x - l.cx);
    expect(at300[0]!.x).toBeCloseTo(l.cx, 6);
    expect(at300[0]!.y).toBeLessThan(l.cy);
    expect(dir(at300[1]!) - dir(at300[0]!)).toBeCloseTo(Math.PI / 18, 6);
    expect(burst(300, false)).toEqual([]);
    expect(burst(1200)).toEqual([]);
    expect(burst(5000)).toEqual([]);
  });

  it("ends a base-speed particle one row past the start limit ring's corner, eased out", () => {
    const s = boardState({});
    const burst = (sinceMs: number) => particles(ended(s, { side: 0, newBest: true, sinceMs }));
    const dist = (p: { x: number; y: number } | undefined) =>
      Math.hypot((p?.x ?? 0) - l.cx, (p?.y ?? 0) - l.cy);
    const reach = ringRadius(l, START_LIMIT_ROWS) + l.rowHeight;
    const end = burst(1200 - 1e-6);
    expect(dist(end[1])).toBeCloseTo(reach, 3);
    expect(dist(end[0])).toBeCloseTo(reach * 0.8, 3);
    expect(dist(end[2])).toBeCloseTo(reach * 1.2, 3);
    expect(dist(end[3])).toBeCloseTo(reach * 0.8, 3);
    // Cubic ease-out: half way through the life it is 7/8 of the way there.
    expect(dist(burst(600)[1])).toBeCloseTo(reach * 0.875, 6);
    expect(dist(burst(0)[1])).toBeCloseTo(0, 9);
    // Full opacity until 60 percent of the life, then a linear fade.
    expect(burst(720)[1]?.alpha).toBe(1);
    expect(burst(960)[1]?.alpha).toBeCloseTo(0.5, 9);
    for (const p of burst(300)) expect(p.r).toBeCloseTo(l.rowHeight / 3, 9);
  });

  it("draws the same thing for the same arguments", () => {
    const { s, popups } = busyRun();
    const ending: PaintEnding = { side: 5, newBest: true, sinceMs: 420 };
    const a = ended(s, ending, 5040, popups);
    const b = ended(s, ending, 5040, popups);
    expect(fingerprint(a)).toBe(fingerprint(b));
    const drawn = ({ cleared, fills, strokes, arcs, texts }: FakeCtx2D) => ({
      cleared,
      fills,
      strokes,
      arcs,
      texts,
    });
    expect(drawn(a)).toEqual(drawn(b));
    expect(particles(a)).toHaveLength(36);
  });
});
