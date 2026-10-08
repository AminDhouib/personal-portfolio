// @vitest-environment node
import { describe, expect, it } from "vitest";
import { drop, newRun, perfectDropTime, craneOffset, topSlab, type TowerRun } from "../engine";
import { stageLayout } from "../layout";
import { PALETTE } from "../palette";
import { PULSE_MS, paintFrame, type CanvasLike, type Scene } from "../painter";

interface Rec {
  strokeRects: { x: number; y: number; w: number; h: number; style: string }[];
  accentRingStrokes: number;
  fillTexts: string[];
}

function fakeCtx(): { ctx: CanvasLike; rec: Rec } {
  const rec: Rec = { strokeRects: [], accentRingStrokes: 0, fillTexts: [] };
  const ctx: CanvasLike = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    globalAlpha: 1,
    textAlign: "left",
    save() {},
    restore() {},
    setTransform() {},
    clearRect() {},
    fillRect() {},
    strokeRect(x, y, w, h) {
      rec.strokeRects.push({ x, y, w, h, style: ctx.strokeStyle });
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      if (ctx.strokeStyle === PALETTE.accent && ctx.lineWidth === 2) rec.accentRingStrokes++;
    },
    fill() {},
    fillText(text) {
      rec.fillTexts.push(text);
    },
    measureText: (text) => ({ width: text.length * 6 }),
  };
  return { ctx, rec };
}

const layout = stageLayout({ containerWidth: 1000, viewportHeight: 900, sheet: false });

function scene(run: TowerRun, over: Partial<Scene> = {}): Scene {
  return {
    run,
    camera: { x: 0, y: 0 },
    debris: [],
    now: 0,
    layout,
    dpr: 1,
    pulses: [],
    landedAt: null,
    shake: { x: 0, y: 0 },
    ...over,
  };
}

function tallRun(floors: number): TowerRun {
  const run = newRun(3, 0);
  const slabs = [...run.slabs];
  for (let i = 0; i < floors; i++) slabs.push({ left: -100, width: 200 });
  return { ...run, slabs };
}

describe("paintFrame", () => {
  it("culls a 200-floor tower to the slabs that fit in the view", () => {
    const { ctx, rec } = fakeCtx();
    const run = tallRun(200);
    paintFrame(ctx, scene(run, { camera: { x: 0, y: 4000 } }));
    const slabOutlines = rec.strokeRects.filter((r) => r.style === PALETTE.slabStroke);
    const visible = Math.ceil(layout.cssHeight / layout.scale / 40);
    expect(slabOutlines.length).toBeGreaterThan(0);
    expect(slabOutlines.length).toBeLessThanOrEqual(visible + 3);
  });

  it("draws the hanging block where the engine will land it", () => {
    const { ctx, rec } = fakeCtx();
    const run = newRun(7, 0);
    const now = 500;
    paintFrame(ctx, scene(run, { now }));
    const hanging = rec.strokeRects.find((r) => r.style === PALETTE.accent);
    const swing = run.swing;
    if (!swing || !hanging) throw new Error("no hanging block");
    const top = topSlab(run);
    const worldLeft = top.left + Math.round(craneOffset(swing, now));
    expect(hanging.x).toBeCloseTo(worldLeft * layout.scale + layout.cssWidth / 2, 6);
    expect(hanging.w).toBeCloseTo(top.width * layout.scale, 6);
  });

  it("draws a perfect ring for 400 ms and not after", () => {
    const run0 = newRun(7, 0);
    const t = perfectDropTime(run0, 0);
    const dropped = drop(run0, t);
    if (!dropped) throw new Error("drop refused");
    const run = dropped.run;
    const ring = (now: number) => {
      const { ctx, rec } = fakeCtx();
      paintFrame(ctx, scene(run, { now, pulses: [t], landedAt: t }));
      return rec.accentRingStrokes;
    };
    expect(ring(t + PULSE_MS - 1)).toBe(1);
    expect(ring(t + PULSE_MS)).toBe(0);
    expect(ring(t + PULSE_MS + 500)).toBe(0);
  });

  it("labels the hanging block with the width it can keep", () => {
    const { ctx, rec } = fakeCtx();
    paintFrame(ctx, scene(newRun(7, 0), { now: 300 }));
    expect(rec.fillTexts).toContain("240");
  });

  it("does not reach for window or document", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const { ctx } = fakeCtx();
    expect(() => paintFrame(ctx, scene(newRun(7, 0)))).not.toThrow();
  });
});
