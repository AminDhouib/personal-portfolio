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
import { layout, ringRadius } from "../layout";
import {
  COMBO_STROKE,
  LIMIT_STROKE,
  LIMIT_WARN_STROKE,
  PALETTE,
  RAINBOW_FILL,
  paint,
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
