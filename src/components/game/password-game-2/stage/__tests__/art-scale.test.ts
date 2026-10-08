import { describe, expect, it } from "vitest";
import { applyKey, createRun, tick } from "../../engine/engine";
import { drainEffects } from "../../engine/effects";
import { EVENT_DEFS } from "../../engine/events/index";
import type { FinaleMissile, MissilesData } from "../../engine/events/finale";
import type { GameState } from "../../engine/types";
import { ART_SCALE } from "../art-scale";
import {
  FINALE_INST,
  PAINTERS,
  type HitRegion,
  type RectLike,
  type StageLayout,
} from "../painters";

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/**
 * A recording 2D context that tracks the transform stack and logs every coordinate a
 * painter draws through (path points, arc and ellipse bounds, rects, text anchors) in
 * canvas space, so a test can bound the art without a real canvas.
 */
function recordingCtx() {
  const points: { x: number; y: number; op: string }[] = [];
  let m: Matrix = [...IDENTITY];
  const stack: Matrix[] = [];
  const mark = (op: string, x: number, y: number) => {
    points.push({ op, x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
  };
  const bounds = (op: string, x: number, y: number, rx: number, ry = rx) => {
    mark(op, x - rx, y - ry);
    mark(op, x + rx, y - ry);
    mark(op, x - rx, y + ry);
    mark(op, x + rx, y + ry);
  };
  const ops: Record<string, (...a: number[]) => unknown> = {
    save: () => stack.push([...m]),
    restore: () => {
      m = stack.pop() ?? [...IDENTITY];
    },
    translate: (x, y) => {
      m = [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    },
    scale: (sx, sy) => {
      m = [m[0] * sx, m[1] * sx, m[2] * sy, m[3] * sy, m[4], m[5]];
    },
    rotate: (a) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      m = [
        m[0] * c + m[2] * s,
        m[1] * c + m[3] * s,
        m[2] * c - m[0] * s,
        m[3] * c - m[1] * s,
        m[4],
        m[5],
      ];
    },
    moveTo: (x, y) => mark("moveTo", x, y),
    lineTo: (x, y) => mark("lineTo", x, y),
    quadraticCurveTo: (cx, cy, x, y) => {
      mark("quadraticCurveTo", cx, cy);
      mark("quadraticCurveTo", x, y);
    },
    arcTo: (x1, y1, x2, y2) => {
      mark("arcTo", x1, y1);
      mark("arcTo", x2, y2);
    },
    arc: (x, y, r) => bounds("arc", x, y, r),
    // An unrotated ellipse is bounded by its own radii; a rotated one by the larger.
    ellipse: (x, y, rx, ry, rot) =>
      rot === 0 ? bounds("ellipse", x, y, rx, ry) : bounds("ellipse", x, y, Math.max(rx, ry)),
    fillRect: (x, y, w, h) => {
      mark("fillRect", x, y);
      mark("fillRect", x + w, y + h);
    },
  };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, p: string) {
      if (p === "measureText") return (s: string) => ({ width: s.length * 8 });
      if (p === "createLinearGradient" || p === "createRadialGradient") {
        return () => ({ addColorStop: () => {} });
      }
      if (p === "fillText") return (_s: string, x: number, y: number) => mark("fillText", x, y);
      if (p in ops) return ops[p];
      if (p in t) return t[p];
      return () => undefined;
    },
    set(t, p: string, v) {
      t[p] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, points };
}

/** Three stage shapes: a 390 phone, the same phone with the keyboard up, a desktop card. */
const STAGES: Record<string, { panel: RectLike; box: RectLike }> = {
  phone: { panel: { x: 0, y: 0, w: 366, h: 400 }, box: { x: 21, y: 133, w: 324, h: 160 } },
  "phone-kb": { panel: { x: 0, y: 0, w: 366, h: 300 }, box: { x: 21, y: 120, w: 324, h: 96 } },
  desktop: { panel: { x: 0, y: 0, w: 760, h: 440 }, box: { x: 25, y: 141, w: 710, h: 160 } },
};

/** Lay the run's cells out like the box does: monospace glyphs, wrapping inside the padding. */
function layoutFor(g: GameState, stage: { panel: RectLike; box: RectLike }): StageLayout {
  const cellRects = new Map<number, RectLike>();
  const { box } = stage;
  const cw = 18;
  const ch = 36;
  let x = box.x + 24;
  let y = box.y + 12;
  for (const cell of g.cells) {
    if (x + cw > box.x + box.w - 24) {
      x = box.x + 24;
      y += ch;
    }
    cellRects.set(cell.id, { x, y, w: cw, h: ch });
    x += cw;
  }
  return { cellRects, boxRect: box, panelRect: stage.panel };
}

/**
 * Snapshots of a real forced run of `id`: the telegraph, then every two seconds of the
 * event's life with a typed password for it to work on. Each snapshot is painted at once
 * (the painter reads the state), so one run feeds every sample.
 */
function eachSnapshot(id: string, visit: (g: GameState) => void) {
  const g = createRun({ seed: 3, daily: false, forceEvent: id });
  for (const k of "Password123abcXYZ") applyKey(g, k);
  g.act = "act1";
  g.actElapsedMs = 0;
  for (let i = 1; i <= 420; i++) {
    tick(g, 100);
    drainEffects(g);
    if (i >= 32 && i % 20 === 12) visit(g);
  }
}

const SLACK = 8;

function expectInside(
  points: { x: number; y: number; op: string }[],
  panel: RectLike,
  tag: string,
) {
  for (const p of points) {
    const inside =
      p.x >= panel.x - SLACK &&
      p.x <= panel.x + panel.w + SLACK &&
      p.y >= panel.y - SLACK &&
      p.y <= panel.y + panel.h + SLACK;
    if (!inside) {
      expect.fail(`${tag}: ${p.op} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) leaves the stage`);
    }
  }
}

function expectBigTargets(hits: HitRegion[], tag: string) {
  for (const h of hits) {
    if (h.shape === "circle") expect(h.r * 2, tag).toBeGreaterThanOrEqual(44);
    else {
      expect(h.w, tag).toBeGreaterThanOrEqual(44);
      expect(h.h, tag).toBeGreaterThanOrEqual(44);
    }
  }
}

describe("ART_SCALE", () => {
  it("enlarges every painter by at least 1.4", () => {
    for (const id of Object.keys(PAINTERS)) {
      expect(ART_SCALE[id], id).toBeGreaterThanOrEqual(1.4);
    }
  });
});

describe.each(EVENT_DEFS.map((d) => d.id))("%s art", (id) => {
  it("stays inside the stage card, and its targets are at least 44 px", () => {
    let painted = 0;
    eachSnapshot(id, (g) => {
      const inst = g.events.find((e) => e.defId === id)!;
      if (inst.data === undefined || inst.phase === "done") return;
      for (const [name, stage] of Object.entries(STAGES)) {
        const layout = layoutFor(g, stage);
        for (const tMs of [0, 2_345, 7_777]) {
          const { ctx, points } = recordingCtx();
          const hits: HitRegion[] = [];
          PAINTERS[id]!(ctx, inst, layout, g, tMs, hits);
          const tag = `${id} ${inst.phase} on ${name} at t=${tMs} (${g.elapsedMs}ms)`;
          expectInside(points, stage.panel, tag);
          expectBigTargets(hits, tag);
          painted += 1;
        }
      }
    });
    expect(painted).toBeGreaterThan(0);
  });
});

describe("finale missiles art", () => {
  it("stays inside the stage card through a whole fall, and every missile is a 44 px target", () => {
    const missiles: FinaleMissile[] = [0, 0.5, 1].flatMap((x, i) => [
      { id: i * 3, x, launchedAtMs: 0, state: "falling" as const },
      { id: i * 3 + 1, x, launchedAtMs: 0, state: "intercepted" as const },
      { id: i * 3 + 2, x, launchedAtMs: 0, state: "landed" as const },
    ]);
    const data: MissilesData = {
      missiles,
      launched: missiles.length,
      landedThisAttempt: 0,
      nextGeraldAtMs: 0,
      lockUntilMs: 0,
    };
    for (const [name, stage] of Object.entries(STAGES)) {
      for (const phaseElapsedMs of [0, 1_000, 2_500, 4_000]) {
        const g = {
          cells: [],
          elapsedMs: 0,
          finale: {
            phase: "missiles",
            phaseElapsedMs,
            allies: [],
            attempts: 0,
            data: { missiles: data },
          },
        } as unknown as GameState;
        for (const tMs of [0, 200, 399]) {
          const { ctx, points } = recordingCtx();
          const hits: HitRegion[] = [];
          PAINTERS["finale-missiles"]!(ctx, FINALE_INST, layoutFor(g, stage), g, tMs, hits);
          const tag = `finale-missiles on ${name} at ${phaseElapsedMs}ms`;
          expectInside(points, stage.panel, tag);
          expectBigTargets(hits, tag);
        }
      }
    }
  });
});
