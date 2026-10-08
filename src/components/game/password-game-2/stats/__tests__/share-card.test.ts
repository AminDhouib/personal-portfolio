import { afterEach, describe, expect, it, vi } from "vitest";
import { CARD_H, CARD_W, canShareFiles, drawShareCard } from "../share-card";

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A recording 2D context: logs the ink box of every rect and text draw. */
function recordingCtx() {
  const boxes: Box[] = [];
  const texts: string[] = [];
  const state = { font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic" };
  const fontPx = () => Number(/(\d+(?:\.\d+)?)px/.exec(state.font)?.[1] ?? 10);
  const ctx = {
    get font() {
      return state.font;
    },
    set font(v: string) {
      state.font = v;
    },
    get textAlign() {
      return state.textAlign;
    },
    set textAlign(v: string) {
      state.textAlign = v;
    },
    get textBaseline() {
      return state.textBaseline;
    },
    set textBaseline(v: string) {
      state.textBaseline = v;
    },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    measureText: (t: string) => ({ width: t.length * fontPx() * 0.6 }),
    fillRect: (x: number, y: number, w: number, h: number) => {
      boxes.push({ x0: x, y0: y, x1: x + w, y1: y + h });
    },
    strokeRect: (x: number, y: number, w: number, h: number) => {
      boxes.push({ x0: x, y0: y, x1: x + w, y1: y + h });
    },
    fillText: (t: string, x: number, y: number) => {
      texts.push(t);
      const w = t.length * fontPx() * 0.6;
      const px = fontPx();
      const x0 = state.textAlign === "center" ? x - w / 2 : state.textAlign === "right" ? x - w : x;
      const y0 = state.textBaseline === "top" ? y : y - px;
      boxes.push({ x0, y0, x1: x0 + w, y1: y0 + px });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, boxes, texts };
}

afterEach(() => vi.unstubAllGlobals());

describe("drawShareCard", () => {
  it("is a 1200x630 card", () => {
    expect([CARD_W, CARD_H]).toEqual([1200, 630]);
  });

  it("draws the time string and stays inside the card", () => {
    const { ctx, boxes, texts } = recordingCtx();
    drawShareCard(ctx, { day: "2026-10-08", ms: 754_000, streak: 3 });
    expect(texts.some((t) => t.includes("12:34"))).toBe(true);
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.x0).toBeGreaterThanOrEqual(0);
      expect(b.y0).toBeGreaterThanOrEqual(0);
      expect(b.x1).toBeLessThanOrEqual(CARD_W);
      expect(b.y1).toBeLessThanOrEqual(CARD_H);
    }
  });

  it("shows the streak only from two days up, and only ASCII text", () => {
    const one = recordingCtx();
    drawShareCard(one.ctx, { day: "2026-10-08", ms: 5000, streak: 1 });
    expect(one.texts.join(" ")).not.toMatch(/streak/i);
    const three = recordingCtx();
    drawShareCard(three.ctx, { day: "2026-10-08", ms: 5000, streak: 3 });
    expect(three.texts.join(" ")).toContain("3-day streak");
    expect(three.texts.join("")).not.toMatch(/[^\x20-\x7e]/);
  });
});

describe("canShareFiles", () => {
  it("is false when navigator.canShare is missing", () => {
    vi.stubGlobal("navigator", {});
    expect(canShareFiles()).toBe(false);
  });

  it("is false when the browser refuses files, true when it accepts them", () => {
    vi.stubGlobal("navigator", { canShare: () => false });
    expect(canShareFiles()).toBe(false);
    vi.stubGlobal("navigator", { canShare: () => true });
    expect(canShareFiles()).toBe(true);
  });
});
