import { describe, expect, it } from "vitest";
import { applyKey, createRun, tick } from "../../engine/engine";
import { drainEffects } from "../../engine/effects";
import { EVENT_DEFS } from "../../engine/events/index";
import type { FinaleMissile, MissilesData } from "../../engine/events/finale";
import type { GameState } from "../../engine/types";
import { ART_SCALE } from "../art-scale";
import { pickHit } from "../hit-test";
import {
  FINALE_INST,
  PAINTERS,
  type HitRegion,
  type RectLike,
  type StageLayout,
} from "../painters";

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** The text state a real context saves and restores with the transform. */
interface TextState {
  font: string;
  textAlign: string;
  textBaseline: string;
}

/** A sans glyph averages about 0.6 em across; enough to bound a label's ink. */
const EM_WIDTH = 0.6;

function fontPx(font: string): number {
  const px = /(\d+(?:\.\d+)?)px/.exec(font);
  return px ? Number(px[1]) : 10;
}

/**
 * A recording 2D context that tracks the transform stack and logs every coordinate a
 * painter draws through (path points, arc and ellipse bounds, rects, and the box a
 * fillText covers by its measured width) in canvas space, so a test can bound the art
 * without a real canvas.
 */
function recordingCtx() {
  const points: { x: number; y: number; op: string }[] = [];
  let m: Matrix = [...IDENTITY];
  let text: TextState = { font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic" };
  const stack: { m: Matrix; text: TextState }[] = [];
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
    save: () => stack.push({ m: [...m], text: { ...text } }),
    restore: () => {
      const top = stack.pop();
      m = top?.m ?? [...IDENTITY];
      if (top) text = top.text;
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
  const measure = (s: string) => s.length * fontPx(text.font) * EM_WIDTH;
  // The ink box of a fillText: its measured width placed by textAlign, its em height
  // placed by textBaseline.
  const fillText = (s: string, x: number, y: number, maxWidth?: number) => {
    const size = fontPx(text.font);
    const w = Math.min(measure(s), maxWidth ?? Infinity);
    const align = text.textAlign;
    const left = align === "center" ? x - w / 2 : align === "right" || align === "end" ? x - w : x;
    const base = text.textBaseline;
    const top =
      base === "middle"
        ? y - size / 2
        : base === "top" || base === "hanging"
          ? y
          : base === "bottom" || base === "ideographic"
            ? y - size
            : y - size * 0.8;
    mark("fillText", left, top);
    mark("fillText", left + w, top);
    mark("fillText", left, top + size);
    mark("fillText", left + w, top + size);
  };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, p: string) {
      if (p === "measureText") return (s: string) => ({ width: measure(s) });
      if (p === "createLinearGradient" || p === "createRadialGradient") {
        return () => ({ addColorStop: () => {} });
      }
      if (p === "fillText") return fillText;
      if (p === "font" || p === "textAlign" || p === "textBaseline") return text[p];
      if (p in ops) return ops[p];
      if (p in t) return t[p];
      return () => undefined;
    },
    set(t, p: string, v) {
      if (p === "font" || p === "textAlign" || p === "textBaseline") text[p] = String(v);
      else t[p] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, points };
}

/**
 * The stage shapes: a 390 phone, the same phone with the keyboard up, a 360 phone (and its
 * keyboard-up card), and a desktop card.
 */
const STAGES: Record<string, { panel: RectLike; box: RectLike }> = {
  phone: { panel: { x: 0, y: 0, w: 366, h: 400 }, box: { x: 21, y: 133, w: 324, h: 160 } },
  "phone-kb": { panel: { x: 0, y: 0, w: 366, h: 300 }, box: { x: 21, y: 120, w: 324, h: 96 } },
  "phone-360": { panel: { x: 0, y: 0, w: 336, h: 400 }, box: { x: 21, y: 133, w: 294, h: 160 } },
  "phone-360-kb": {
    panel: { x: 0, y: 0, w: 336, h: 300 },
    box: { x: 21, y: 120, w: 294, h: 96 },
  },
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

// No slack: every point of the art, text included, stays on the card.
const SLACK = 0;

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

const inRect = (r: RectLike, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * Probes each target through pickHit as the shell does, rather than reading its declared
 * size: a fine pointer hits its centre (and, for a glyph target, nothing past the glyph's
 * own box), and a coarse tap anywhere 21 px out (a 44 px target) hits something, unless it
 * lands on a neighbouring glyph, where a glyph target must give way to the caret.
 */
function expectBigTargets(hits: HitRegion[], layout: StageLayout, tag: string) {
  const cells = [...layout.cellRects.values()];
  const probes = [
    [21, 0],
    [-21, 0],
    [0, 21],
    [0, -21],
    [15, 15],
    [-15, 15],
    [15, -15],
    [-15, -15],
  ] as const;
  for (const h of hits) {
    const cx = h.shape === "rect" ? h.x + h.w / 2 : h.x;
    const cy = h.shape === "rect" ? h.y + h.h / 2 : h.y;
    // A parasite is a glyph target: its own box is the laid-out cell, not the region.
    const own =
      h.target.kind === "parasite" ? layout.cellRects.get(Number(h.target.id)) : undefined;
    expect(pickHit(hits, cx, cy, { coarse: false, cells }), `${tag} centre`).toEqual(h.target);
    for (const [dx, dy] of probes) {
      const x = cx + dx;
      const y = cy + dy;
      if (own && !inRect(own, x, y)) {
        expect(
          pickHit(hits, x, y, { coarse: false, cells }),
          `${tag} fine (${dx}, ${dy})`,
        ).not.toEqual(h.target);
      }
      const got = pickHit(hits, x, y, { coarse: true, cells });
      const at = `${tag} coarse (${dx}, ${dy})`;
      if (own && cells.some((c) => c !== own && inRect(c, x, y))) {
        expect(got, at).not.toEqual(h.target);
      } else {
        expect(got, at).not.toBeNull();
      }
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
          expectBigTargets(hits, layout, tag);
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
          const layout = layoutFor(g, stage);
          PAINTERS["finale-missiles"]!(ctx, FINALE_INST, layout, g, tMs, hits);
          const tag = `finale-missiles on ${name} at ${phaseElapsedMs}ms`;
          expectInside(points, stage.panel, tag);
          expectBigTargets(hits, layout, tag);
        }
      }
    }
  });
});
