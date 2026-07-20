/*
 * Password Game 2 — canvas event painters.
 *
 * Every scheduled event gets ONE painter, keyed by def id, plus a special
 * "finale-missiles" painter. A painter draws ALL of an event's phases: a distinct
 * telegraph (the dramatic-irony foreshadow), then onset/peak. Everything is a
 * vector shape — paths, gradients, sparing shadowBlur glow — over the sterile
 * corporate form; no bitmaps, no emoji. The bar is stream-legibility: each event
 * must read instantly at 1080p.
 *
 * Coordinates are CSS pixels relative to the canvas origin (= panel border box).
 * The overlay pre-scales the context by devicePixelRatio, so painters think in CSS
 * px. Painters are pure functions of (data, layout, time); the only retained state
 * is a tiny per-instance animation store (ANIM) for effects that need a previous
 * value (a campfire hop, a parasite glyph). Keep per-frame allocation low.
 */

import type { EventInstance, GameState, PointerTarget } from "../engine/types";
import type { GeraldData } from "../engine/events/gerald";
import type { CampfireData } from "../engine/events/campfire";
import type { GardenData } from "../engine/events/garden";
import type { BlackHoleData } from "../engine/events/black-hole";
import type { ParasiteData } from "../engine/events/parasite";
import type { GalagaData, Alien } from "../engine/events/galaga";
import type { SnakeData } from "../engine/events/snake";
import type { TetrisData } from "../engine/events/tetris";
import { MISSILE_FALL_MS, type MissilesData } from "../engine/events/finale";

/** A rectangle in canvas-local CSS pixels. */
export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Per-frame measured geometry, cached by the overlay against g.version + resize. */
export interface StageLayout {
  cellRects: Map<number, RectLike>;
  boxRect: RectLike | null;
  panelRect: RectLike;
}

/** A clickable region a painter registers for the current frame. */
export interface HitRegion {
  shape: "rect" | "circle";
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  target: PointerTarget;
}

export type Painter = (
  ctx: CanvasRenderingContext2D,
  inst: EventInstance,
  layout: StageLayout,
  g: GameState,
  tMs: number,
  hits: HitRegion[],
) => void;

// --- family accents (viewers learn threat type by color) ---------------------

const GREEN = "#4ade80"; // inhabitants
const VIOLET = "#a78bfa"; // forces
const RED = "#f87171"; // invasions
const AMBER = "#fbbf24"; // chrome

// --- shared helpers -----------------------------------------------------------

/** Tiny retained animation state, keyed by the live event instance. */
const ANIM = new WeakMap<object, Record<string, number>>();
function anim(inst: object): Record<string, number> {
  let a = ANIM.get(inst);
  if (!a) {
    a = {};
    ANIM.set(inst, a);
  }
  return a;
}

function rectOfIndex(layout: StageLayout, g: GameState, i: number): RectLike | undefined {
  const cell = g.cells[i];
  if (!cell) return undefined;
  return layout.cellRects.get(cell.id);
}

function pushRect(
  hits: HitRegion[],
  x: number,
  y: number,
  w: number,
  h: number,
  target: PointerTarget,
) {
  hits.push({ shape: "rect", x, y, w, h, r: 0, target });
}
function pushCircle(hits: HitRegion[], x: number, y: number, r: number, target: PointerTarget) {
  hits.push({ shape: "circle", x, y, w: 0, h: 0, r, target });
}

function withGlow(ctx: CanvasRenderingContext2D, color: string, blur: number, fn: () => void) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  fn();
  ctx.restore();
}

/** A rounded-rect path (no fill/stroke). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** A small labelled action chip (feed / stoke / basket), returns its rect. */
function chip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  color: string,
  ready: boolean,
): RectLike {
  const w = 22 + label.length * 8.5;
  const h = 30;
  ctx.save();
  withGlow(ctx, color, ready ? 14 : 0, () => {
    roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = ready ? color : "rgba(148,163,184,0.55)";
    ctx.fill();
  });
  roundRect(ctx, x, y, w, h, 8);
  ctx.strokeStyle = "rgba(15,23,42,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#0b1220";
  ctx.font = "700 13px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
  ctx.restore();
  return { x, y, w, h };
}

/**
 * A shared crisis-meter idiom: a labelled horizontal bar with an optional
 * pass/fail threshold tick and a right-aligned readout. Full width is `max`, the
 * fill is `value`, the accent is the caller's family `color`. This painter is
 * time-free and event-agnostic — a caller that wants a below-threshold bar to
 * read as a crisis pulses or reddens `color` itself before calling in.
 */
export interface MeterSpec {
  x: number;
  y: number;
  w: number; // top-left + width, canvas px
  value: number;
  max: number; // current / full-scale
  threshold?: number; // pass/fail tick, same units as value
  label: string; // name tag above the bar
  valueText?: string; // right-aligned readout; default `${Math.round(value)}`
  color: string; // family accent (painters already resolve these)
}

const METER_BAR_H = 6;

export function drawCrisisMeter(c: CanvasRenderingContext2D, spec: MeterSpec): void {
  const { x, y, w, value, max, threshold, label, color } = spec;
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const valueText = spec.valueText ?? `${Math.round(value)}`;

  c.save();
  c.textBaseline = "alphabetic";
  // Name tag (left) and readout (right) on the line above the bar.
  c.font = "700 10px ui-sans-serif, system-ui, sans-serif";
  c.textAlign = "left";
  c.fillStyle = "rgba(148,163,184,0.9)";
  c.fillText(label, x, y - 5);
  c.textAlign = "right";
  c.fillStyle = color;
  c.fillText(valueText, x + w, y - 5);

  // Track.
  roundRect(c, x, y, w, METER_BAR_H, METER_BAR_H / 2);
  c.fillStyle = "rgba(15,23,42,0.14)";
  c.fill();
  // Fill.
  if (frac > 0) {
    roundRect(c, x, y, w * frac, METER_BAR_H, METER_BAR_H / 2);
    c.fillStyle = color;
    c.fill();
  }
  // Pass/fail tick.
  if (threshold !== undefined && max > 0) {
    const tx = x + w * Math.max(0, Math.min(1, threshold / max));
    c.fillStyle = "rgba(226,232,240,0.9)";
    c.fillRect(tx - 1, y - 2, 2, METER_BAR_H + 4);
  }
  c.restore();
}

// --- gerald -------------------------------------------------------------------

function drawFish(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  facing: number,
  bellyUp: boolean,
  murky: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * scale, (bellyUp ? -1 : 1) * scale);
  const body = murky ? "#65a30d" : GREEN;
  withGlow(ctx, body, 12, () => {
    // tail
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(-27, -10);
    ctx.lineTo(-23, 0);
    ctx.lineTo(-27, 10);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();
    // dorsal fin
    ctx.beginPath();
    ctx.moveTo(-4, -9);
    ctx.quadraticCurveTo(3, -19, 11, -8);
    ctx.closePath();
    ctx.fill();
    // body
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  // eye
  ctx.beginPath();
  ctx.arc(9, -2.5, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#f8fafc";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(10, -2.5, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = "#0b1220";
  ctx.fill();
  // mouth: a frown when belly-up (sulking), a smile otherwise
  ctx.beginPath();
  ctx.strokeStyle = "#0b1220";
  ctx.lineWidth = 1.4;
  if (bellyUp) ctx.arc(13, 6, 3.5, Math.PI * 1.15, Math.PI * 1.85);
  else ctx.arc(13, 2, 3.5, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  ctx.restore();
}

function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(74,222,128,${alpha})`;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

const paintGerald: Painter = (ctx, inst, layout, g, tMs, hits) => {
  const box = layout.boxRect;
  if (!box) return;
  const d = inst.data as GeraldData;

  if (inst.phase === "telegraph") {
    // Telegraph: bubbles rising in the box's bottom-left corner.
    const bx = box.x + 26;
    for (let i = 0; i < 5; i++) {
      const t = (tMs / 1400 + i * 0.37) % 1;
      const y = box.y + box.h - 8 - t * (box.h * 0.5);
      bubble(ctx, bx + Math.sin(t * 6 + i) * 8, y, 2 + i * 0.6, (1 - t) * 0.8);
    }
    return;
  }

  // Peak: a water line across the lower box + Gerald swimming below it.
  const waterY = box.y + box.h * 0.5;
  const grad = ctx.createLinearGradient(0, waterY, 0, box.y + box.h);
  const top = d.murky ? "rgba(101,163,13,0.20)" : "rgba(56,189,248,0.16)";
  const bot = d.murky ? "rgba(63,98,18,0.34)" : "rgba(37,99,235,0.28)";
  grad.addColorStop(0, top);
  grad.addColorStop(1, bot);
  ctx.save();
  roundRect(ctx, box.x + 2, waterY, box.w - 4, box.y + box.h - waterY - 2, 8);
  ctx.clip();
  ctx.fillStyle = grad;
  ctx.fillRect(box.x, waterY - 6, box.w, box.h);
  // wavy surface
  ctx.beginPath();
  ctx.moveTo(box.x, waterY);
  for (let x = 0; x <= box.w; x += 12) {
    ctx.lineTo(box.x + x, waterY + Math.sin(x / 34 + tMs / 500) * 3);
  }
  ctx.strokeStyle = d.murky ? "rgba(132,204,22,0.7)" : "rgba(56,189,248,0.8)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  const starved = d.hunger >= 100;
  const swimW = box.w - 90;
  const swX = box.x + 55 + (0.5 + 0.5 * Math.sin(tMs / 1600)) * Math.max(40, swimW);
  const swY = starved ? waterY + 12 : waterY + box.h * 0.28 + Math.sin(tMs / 700) * 6;
  drawFish(ctx, swX, swY, 1, Math.cos(tMs / 1600) >= 0 ? 1 : -1, starved, d.murky);

  // Feed chip, top-right of the box.
  const c = chip(ctx, box.x + box.w - 92, box.y + 12, "FEED", GREEN, true);
  pushRect(hits, c.x, c.y, c.w, c.h, { kind: "feed-button" });
};

// --- campfire -----------------------------------------------------------------

function drawFlame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  t: number,
  hue: string,
) {
  const flick = 1 + Math.sin(t) * 0.12;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - 9, y - h * 0.5, x - 3, y - h * 0.72 * flick);
  ctx.quadraticCurveTo(x - 7, y - h * 0.55, x, y - h * flick);
  ctx.quadraticCurveTo(x + 7, y - h * 0.55, x + 3, y - h * 0.72 * flick);
  ctx.quadraticCurveTo(x + 9, y - h * 0.5, x, y);
  ctx.closePath();
  ctx.fillStyle = hue;
  ctx.fill();
}

const paintCampfire: Painter = (ctx, inst, layout, g, tMs, hits) => {
  const box = layout.boxRect;
  if (!box) return;
  const d = inst.data as CampfireData;

  if (inst.phase === "telegraph") {
    // Telegraph: drifting smoke wisps at the box bottom.
    const sx = box.x + box.w * 0.5;
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const t = (tMs / 2200 + i * 0.33) % 1;
      ctx.beginPath();
      const baseY = box.y + box.h - 6;
      ctx.moveTo(sx + (i - 1) * 14, baseY);
      for (let s = 0; s <= 1; s += 0.2) {
        ctx.lineTo(
          sx + (i - 1) * 14 + Math.sin(s * 7 + t * 6 + i) * 12 * s,
          baseY - s * box.h * 0.55 * (0.6 + t * 0.5),
        );
      }
      ctx.strokeStyle = `rgba(148,163,184,${(1 - t) * 0.35})`;
      ctx.lineWidth = 3 + t * 5;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const fx = box.x + box.w * 0.5;
  const fy = box.y + box.h - 14;
  // Logs.
  ctx.save();
  ctx.fillStyle = "#7c4a24";
  for (const rot of [-0.5, 0.5]) {
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(rot);
    roundRect(ctx, -26, -5, 52, 10, 5);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  if (d.burning) {
    const scale = 0.5 + (d.fuel / 100) * 0.9;
    withGlow(ctx, "#fb923c", 22, () => {
      drawFlame(ctx, fx, fy - 2, 54 * scale, tMs / 120, "#f97316");
      drawFlame(ctx, fx - 6, fy - 2, 38 * scale, tMs / 90 + 1, "#fbbf24");
      drawFlame(ctx, fx + 6, fy - 2, 40 * scale, tMs / 100 + 2, "#f59e0b");
      drawFlame(ctx, fx, fy - 2, 22 * scale, tMs / 70 + 3, "#fde68a");
    });
    // embers rising
    for (let i = 0; i < 6; i++) {
      const t = (tMs / 1100 + i * 0.31) % 1;
      ctx.beginPath();
      ctx.arc(
        fx + Math.sin(t * 8 + i) * 16,
        fy - 10 - t * 70 * scale,
        1.6 * (1 - t),
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = `rgba(251,191,36,${1 - t})`;
      ctx.fill();
    }
  } else {
    // Smoldering: low embers, no flame — the fire is dying.
    withGlow(ctx, "#7c2d12", 10, () => {
      ctx.beginPath();
      ctx.ellipse(fx, fy - 2, 20, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(124,45,18,0.8)";
      ctx.fill();
    });
  }

  // Fuel gauge above the fire.
  const gw = 70;
  drawCrisisMeter(ctx, {
    x: fx - gw / 2,
    y: box.y + box.h - 70,
    w: gw,
    value: d.fuel,
    max: 100,
    label: "FUEL",
    color: d.fuel < 25 ? RED : "#f59e0b",
  });

  // Stoke chip, top-right — hops when buttonHops changes.
  const a = anim(inst);
  if (a.hops !== d.buttonHops) {
    a.hops = d.buttonHops;
    a.hopAt = tMs;
  }
  const hopT = a.hopAt ? Math.max(0, 1 - (tMs - a.hopAt) / 360) : 0;
  const hop = Math.sin(hopT * Math.PI) * 8;
  const ready = g.elapsedMs >= d.stokeReadyAtMs;
  const c = chip(ctx, box.x + box.w - 96, box.y + 12 - hop, "STOKE", "#f59e0b", ready);
  pushRect(hits, c.x, c.y, c.w, c.h, { kind: "stoke-button" });
};

// --- garden -------------------------------------------------------------------

function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  // stem
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(Math.sin(t) * 4, -14, 0, -26);
  ctx.strokeStyle = "#16a34a";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // petals
  ctx.translate(0, -30);
  ctx.rotate(Math.sin(t) * 0.15);
  withGlow(ctx, GREEN, 6, () => {
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(
        Math.cos((i / 6) * Math.PI * 2) * 7,
        Math.sin((i / 6) * Math.PI * 2) * 7,
        5,
        3.2,
        (i / 6) * Math.PI * 2,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = "#f9a8d4";
      ctx.fill();
    }
  });
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#fbbf24";
  ctx.fill();
  ctx.restore();
}

function drawBear(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  alpha: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = `rgba(41,25,15,${alpha})`;
  // body
  ctx.beginPath();
  ctx.ellipse(0, 0, 40, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.arc(40, -18, 22, 0, Math.PI * 2);
  ctx.fill();
  // ears
  ctx.beginPath();
  ctx.arc(32, -36, 8, 0, Math.PI * 2);
  ctx.arc(50, -36, 8, 0, Math.PI * 2);
  ctx.fill();
  // snout + eye highlights only when solid (not a shadow)
  if (alpha > 0.85) {
    ctx.beginPath();
    ctx.arc(52, -14, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#5b3b22";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(56, -15, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = "#0b0704";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(36, -22, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = "#fca5a5";
    ctx.fill();
  }
  ctx.restore();
}

// Display-only mirrors of garden.ts MIN_HONEY / RAID_DURATION_MS; the engine owns
// the real values, the painter only reads them to draw the hive meter and drain.
const HIVE_THRESHOLD = 40;
const GARDEN_RAID_MS = 6000;

const paintGarden: Painter = (ctx, inst, layout, g, tMs, hits) => {
  const box = layout.boxRect;
  if (!box) return;
  const d = inst.data as GardenData;

  if (inst.phase === "telegraph") {
    // Telegraph: vines creeping in from the box's left edge.
    ctx.save();
    ctx.strokeStyle = "rgba(22,163,74,0.75)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    const grow = Math.min(1, inst.phaseElapsedMs / 6000);
    for (let i = 0; i < 3; i++) {
      const baseY = box.y + box.h * (0.35 + i * 0.25);
      ctx.beginPath();
      ctx.moveTo(box.x, baseY);
      const len = box.w * 0.4 * grow;
      for (let s = 0; s <= len; s += 10) {
        ctx.lineTo(box.x + s, baseY + Math.sin(s / 20 + i + tMs / 900) * 8);
      }
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // Flowers along the box bottom (bloomed 0..3).
  const n = Math.max(0, Math.min(3, d.bloomed));
  for (let i = 0; i < n; i++) {
    drawFlower(ctx, box.x + 40 + i * 46, box.y + box.h - 8, tMs / 700 + i);
  }
  // Honey meter — always visible; loud (red, pulsing) while the hive sits below
  // the rule threshold, calm amber above. During a raid the readout ticks toward
  // zero across the raid window (display-only; the engine snaps at raid end).
  const raidProgress =
    d.bearState === "raiding"
      ? Math.max(0, Math.min(1, (g.elapsedMs - (d.raidEndsAtMs - GARDEN_RAID_MS)) / GARDEN_RAID_MS))
      : 0;
  const displayHoney = Math.round(d.honey * (1 - raidProgress));
  const loud = displayHoney < HIVE_THRESHOLD;
  const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(tMs / 160));
  drawCrisisMeter(ctx, {
    x: box.x + 16,
    y: box.y + 26,
    w: 120,
    value: displayHoney,
    max: 100,
    threshold: HIVE_THRESHOLD,
    label: "HIVE",
    valueText: String(displayHoney),
    color: loud ? `rgba(248,113,113,${pulse})` : AMBER,
  });

  // The bear: a looming shadow with a shrinking countdown arc when telegraphed,
  // the lumbering silhouette when raiding.
  if (d.bearState === "telegraphed") {
    const bx = box.x + box.w * 0.5;
    const by = box.y + 30;
    const bearPulse = 0.3 + 0.15 * Math.sin(tMs / 300);
    drawBear(ctx, bx, by, 0.8, bearPulse);
    // 8000 mirrors garden.ts BEAR_TELEGRAPH_MS; the arc empties as the raid nears.
    const remain = Math.max(0, Math.min(1, (d.nextBearAtMs - g.elapsedMs) / 8000));
    ctx.save();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(bx, by, 34, -Math.PI / 2, -Math.PI / 2 + remain * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (d.bearState === "raiding") {
    const t = Math.min(1, inst.phaseElapsedMs / 800);
    const bx = box.x - 40 + t * (box.w * 0.4 + 40);
    drawBear(ctx, bx, box.y + box.h * 0.5 + Math.sin(tMs / 200) * 4, 1.1, 1);
  }

  // Basket chip, top-right — lit while the bear is telegraphed or raiding, dimmed
  // with a "bear away" sub-label otherwise.
  const active = d.bearState !== "away";
  const label = active ? "THROW BASKET" : "BASKET";
  const chipW = 22 + label.length * 8.5;
  const c = chip(
    ctx,
    box.x + box.w - chipW - 12,
    box.y + 12,
    label,
    active ? "#16a34a" : GREEN,
    active,
  );
  pushRect(hits, c.x, c.y, c.w, c.h, { kind: "basket-button" });
  if (!active) {
    ctx.save();
    ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(148,163,184,0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("bear away", c.x + c.w / 2, c.y + c.h + 3);
    ctx.restore();
  }
};

// --- infection ----------------------------------------------------------------

const paintInfection: Painter = (ctx, inst, layout, g, tMs) => {
  const box = layout.boxRect;
  if (!box) return;

  if (inst.phase === "telegraph") {
    // Telegraph: a sickly green shimmer sweeping across the cells.
    const sweep = (tMs / 900) % 1;
    ctx.save();
    if (box) {
      roundRect(ctx, box.x + 2, box.y + 2, box.w - 4, box.h - 4, 10);
      ctx.clip();
    }
    const cx = box.x + sweep * box.w;
    const grad = ctx.createLinearGradient(cx - 60, 0, cx + 60, 0);
    grad.addColorStop(0, "rgba(34,197,94,0)");
    grad.addColorStop(0.5, "rgba(34,197,94,0.28)");
    grad.addColorStop(1, "rgba(34,197,94,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.restore();
    return;
  }

  // Peak: pulsing spore glow over each infected/mutated cell, with drifting spores.
  for (const cell of g.cells) {
    if (cell.status !== "infected" && cell.status !== "mutated") continue;
    const r = layout.cellRects.get(cell.id);
    if (!r) continue;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const pulse = 0.5 + 0.5 * Math.sin(tMs / 260 + cell.id);
    withGlow(ctx, GREEN, 8 + pulse * 10, () => {
      ctx.beginPath();
      ctx.arc(cx, cy, 3 + pulse * 2, 0, Math.PI * 2);
      ctx.fillStyle = cell.status === "mutated" ? "rgba(22,101,52,0.6)" : "rgba(34,197,94,0.5)";
      ctx.fill();
    });
    for (let i = 0; i < 3; i++) {
      const t = (tMs / 1300 + i * 0.33 + cell.id * 0.1) % 1;
      ctx.beginPath();
      ctx.arc(cx + Math.sin(t * 7 + cell.id) * 10, cy - t * 18, 1.4 * (1 - t), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(74,222,128,${(1 - t) * 0.8})`;
      ctx.fill();
    }
  }
};

// --- black hole ---------------------------------------------------------------

const paintBlackHole: Painter = (ctx, inst, layout, g, tMs) => {
  const d = inst.data as BlackHoleData;
  const anchor = rectOfIndex(layout, g, d.anchorIndex) ?? layout.boxRect;
  if (!anchor) return;
  const cx = anchor.x + anchor.w / 2;
  const cy = anchor.y + anchor.h / 2;

  if (inst.phase === "telegraph") {
    // Telegraph: space-distortion warp lines converging on the anchor.
    ctx.save();
    ctx.strokeStyle = "rgba(167,139,250,0.55)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + tMs / 1400;
      const r0 = 46 + ((tMs / 18 + i * 12) % 40);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * (r0 - 16), cy + Math.sin(ang) * (r0 - 16));
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // Peak: an accretion disk swirling into a dark core.
  ctx.save();
  ctx.translate(cx, cy);
  withGlow(ctx, VIOLET, 26, () => {
    for (let ring = 0; ring < 4; ring++) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(167,139,250,${0.5 - ring * 0.1})`;
      ctx.lineWidth = 3 - ring * 0.5;
      const rr = 14 + ring * 8;
      ctx.ellipse(0, 0, rr, rr * 0.5, tMs / 700 + ring, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  // dark core
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
  core.addColorStop(0, "#0b0714");
  core.addColorStop(0.7, "#1e1033");
  core.addColorStop(1, "rgba(30,16,51,0)");
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fillStyle = core;
  ctx.fill();
  ctx.restore();

  // Captured cells spiralling in.
  d.capturedIds.forEach((id, i) => {
    const cell = g.cells.find((c) => c.id === id);
    const glyph = cell?.ch ?? "?";
    const ang = tMs / 500 + i * 1.3;
    const rad = 34 + i * 3;
    ctx.save();
    ctx.font = "600 18px ui-monospace, monospace";
    ctx.fillStyle = "rgba(196,181,253,0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(glyph, cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.6);
    ctx.restore();
  });

  // The heavy-word label riding the swirl.
  ctx.save();
  ctx.font = "800 13px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = `FEED IT: ${d.heavyWord}`;
  const lw = ctx.measureText(label).width + 16;
  roundRect(ctx, cx - lw / 2, cy - 46, lw, 20, 6);
  ctx.fillStyle = "rgba(30,16,51,0.9)";
  ctx.fill();
  ctx.fillStyle = VIOLET;
  ctx.fillText(label, cx, cy - 36);
  ctx.restore();
};

// --- parasite -----------------------------------------------------------------

const paintParasite: Painter = (ctx, inst, layout, g, tMs, hits) => {
  const d = inst.data as ParasiteData;
  // The tell fires for 300ms every 6s, derived from phase time. Hit rects are
  // registered EVERY frame so a click always evicts, but the glyph only shows
  // inside the wiggle window — silent dramatic irony the rest of the time.
  const wiggling = inst.phase !== "telegraph" && inst.phaseElapsedMs % 6000 < 300;
  for (const id of d.parasiteIds) {
    const cell = g.cells.find((c) => c.id === id);
    if (!cell) continue;
    const r = layout.cellRects.get(id);
    if (!r) continue;
    pushRect(hits, r.x - 2, r.y - 2, r.w + 4, r.h + 4, { kind: "parasite", id });
    if (!wiggling) continue;
    const wob = Math.sin(tMs / 40) * 3;
    ctx.save();
    ctx.font = `600 ${Math.round(r.h * 0.8)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    withGlow(ctx, VIOLET, 12, () => {
      ctx.fillStyle = VIOLET;
      ctx.fillText(cell.ch, r.x + r.w / 2 + wob, r.y + r.h / 2 + Math.cos(tMs / 40) * 2);
    });
    ctx.restore();
  }
};

// --- galaga -------------------------------------------------------------------

const COLS = 6;

function alienSlot(
  box: RectLike,
  panel: RectLike,
  formationIndex: number,
  assembled: number,
): { x: number; y: number } {
  const col = formationIndex % COLS;
  const row = Math.floor(formationIndex / COLS);
  const spacing = Math.min(46, (panel.w - 60) / COLS);
  const cx = box.x + box.w / 2 + (col - (COLS - 1) / 2) * spacing;
  const targetY = 24 + row * 30;
  // during assembly, slots slide down into place from above the panel
  const y = targetY - (1 - assembled) * (120 + row * 20);
  return { x: cx, y };
}

function drawAlien(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  carrying: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  const wing = Math.sin(t) * 3;
  withGlow(ctx, RED, carrying ? 16 : 8, () => {
    ctx.fillStyle = carrying ? "#fca5a5" : RED;
    // body
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // wings
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.lineTo(-19, -6 - wing);
    ctx.lineTo(-14, 3);
    ctx.closePath();
    ctx.moveTo(11, 0);
    ctx.lineTo(19, -6 - wing);
    ctx.lineTo(14, 3);
    ctx.closePath();
    ctx.fill();
  });
  // eyes
  ctx.fillStyle = "#0b1220";
  ctx.beginPath();
  ctx.arc(-4, -1, 1.8, 0, Math.PI * 2);
  ctx.arc(4, -1, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const paintGalaga: Painter = (ctx, inst, layout, g, tMs, hits) => {
  const box = layout.boxRect;
  const panel = layout.panelRect;
  if (!box) return;
  const d = inst.data as GalagaData;

  // Assembly progress: telegraph slides the fleet in row by row.
  const assembled = inst.phase === "telegraph" ? Math.min(1, inst.phaseElapsedMs / 9000) : 1;

  for (const a of d.aliens as Alien[]) {
    if (a.state === "fled" || a.state === "down") continue;
    const slot = alienSlot(box, panel, a.formationIndex, assembled);
    let x = slot.x + Math.sin(tMs / 600 + a.formationIndex) * 3;
    let y = slot.y;

    if (a.state === "diving" && a.diveStartedAtMs !== null) {
      // 2000 mirrors galaga.ts GRAB_DELAY_MS: the dive must visually reach the
      // box exactly when the engine grabs the glyph.
      const t = Math.min(1, (g.elapsedMs - a.diveStartedAtMs) / 2000);
      y = slot.y + t * (box.y + box.h * 0.6 - slot.y);
      x = slot.x + Math.sin(t * 6) * 40;
    } else if (a.state === "carrying") {
      // rising back to formation with a stolen glyph
      const t =
        a.diveStartedAtMs !== null ? Math.min(1, (g.elapsedMs - a.diveStartedAtMs) / 3000) : 0;
      y = box.y + box.h * 0.4 - t * (box.h * 0.4);
      x = slot.x;
      const cell =
        a.carriedCellId !== null ? g.cells.find((c) => c.id === a.carriedCellId) : undefined;
      if (cell) {
        ctx.save();
        ctx.font = "600 16px ui-monospace, monospace";
        ctx.fillStyle = "#fecaca";
        ctx.textAlign = "center";
        ctx.fillText(cell.ch, x, y + 20);
        ctx.restore();
      }
    }

    drawAlien(ctx, x, y, tMs / 140 + a.formationIndex, a.state === "carrying");
    if (a.state === "formation" || a.state === "diving") {
      pushCircle(hits, x, y, 16, { kind: "alien", id: a.id });
    }
  }
};

// --- snake --------------------------------------------------------------------

const paintSnake: Painter = (ctx, inst, layout, g, tMs) => {
  const box = layout.boxRect;
  if (!box) return;
  const d = inst.data as SnakeData;

  if (inst.phase === "telegraph") {
    // Telegraph: grass rustling along the box's bottom edge.
    ctx.save();
    ctx.strokeStyle = "rgba(248,113,113,0.6)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let x = box.x + 12; x < box.x + box.w - 12; x += 12) {
      const sway = Math.sin(x / 18 + tMs / 300) * 5;
      ctx.beginPath();
      ctx.moveTo(x, box.y + box.h - 4);
      ctx.lineTo(x + sway, box.y + box.h - 16);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // Peak: a slithering snake whose body lumps grow with each swallowed letter.
  const segs = 6 + d.swallowedIds.length;
  const midY = box.y + box.h * 0.68;
  const headX = box.x + 40 + (0.5 + 0.5 * Math.sin(tMs / 1400)) * (box.w - 80);
  const dir = Math.cos(tMs / 1400) >= 0 ? -1 : 1; // body trails behind the head
  ctx.save();
  ctx.lineCap = "round";
  for (let i = segs - 1; i >= 0; i--) {
    const x = headX + dir * i * 15;
    const y = midY + Math.sin(i * 0.6 + tMs / 300) * 8;
    const swollen = i > 0 && i <= d.swallowedIds.length;
    const rad = swollen ? 11 : 8;
    withGlow(ctx, RED, i === 0 ? 12 : 4, () => {
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "#ef4444" : "#f87171";
      ctx.fill();
    });
    if (swollen) {
      const cell = g.cells.find((c) => c.id === d.swallowedIds[i - 1]);
      if (cell) {
        ctx.fillStyle = "rgba(11,18,32,0.65)";
        ctx.font = "600 11px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(cell.ch, x, y);
      }
    }
    if (i === 0) {
      // eyes + flicking tongue
      ctx.fillStyle = "#0b1220";
      ctx.beginPath();
      ctx.arc(x - dir * 3, y - 3, 1.6, 0, Math.PI * 2);
      ctx.arc(x - dir * 3, y + 3, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const tongue = 8 + Math.abs(Math.sin(tMs / 120)) * 6;
      ctx.moveTo(x - dir * 10, y);
      ctx.lineTo(x - dir * (10 + tongue), y);
      ctx.stroke();
    }
  }
  ctx.restore();

  // The pellet it hunts (a glowing target glyph).
  ctx.save();
  withGlow(ctx, RED, 14, () => {
    ctx.beginPath();
    ctx.arc(box.x + box.w - 30, box.y + box.h - 30, 10, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(248,113,113,0.25)";
    ctx.fill();
  });
  ctx.fillStyle = RED;
  ctx.font = "700 15px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(d.pelletChar, box.x + box.w - 30, box.y + box.h - 30);
  ctx.restore();
};

// --- tetris -------------------------------------------------------------------

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  ch: string,
  ghost: boolean,
) {
  ctx.save();
  roundRect(ctx, x - s / 2, y - s / 2, s, s, 3);
  if (ghost) {
    ctx.strokeStyle = "rgba(248,113,113,0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
  } else {
    withGlow(ctx, RED, 10, () => {
      ctx.fillStyle = "rgba(248,113,113,0.9)";
      ctx.fill();
    });
    ctx.strokeStyle = "#b91c1c";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#450a0a";
    ctx.font = `700 ${Math.round(s * 0.6)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ch, x, y + 1);
  }
  ctx.restore();
}

const paintTetris: Painter = (ctx, inst, layout, g, tMs) => {
  const box = layout.boxRect;
  if (!box) return;
  const d = inst.data as TetrisData;
  const s = 26;

  const colFor = (targetIndex: number) =>
    box.x + 24 + (((targetIndex % 22) + 0.5) / 22) * (box.w - 48);

  if (inst.phase === "telegraph") {
    // Telegraph: block shadows sliding across the strip above the box.
    for (let i = 0; i < 5; i++) {
      const x = box.x + 24 + ((tMs / 40 + i * 90) % (box.w - 48));
      drawBlock(ctx, x, box.y - 22, s, "", true);
    }
    return;
  }

  for (const drop of d.drops) {
    if (drop.landed) continue;
    // 2500 mirrors tetris.ts LAND_DELAY_MS: the block must visually touch down
    // exactly when the engine wedges the garbage cell in.
    const t = Math.min(1, (g.elapsedMs - drop.startAtMs) / 2500);
    const x = colFor(drop.targetIndex);
    const y = box.y - 24 + t * (box.h * 0.5 + 24);
    drawBlock(ctx, x, box.y + box.h * 0.5, s, "", true); // landing-zone ghost
    drawBlock(ctx, x, y, s, drop.char, false);
  }
};

// --- chrome telegraph (shared) ------------------------------------------------

const paintChromeTelegraph: Painter = (ctx, inst, layout, g, tMs) => {
  // The chrome family lives in the DOM layer; on canvas it only telegraphs — a
  // brief system flicker before the corporate interruption takes over.
  if (inst.phase !== "telegraph") return;
  const p = layout.panelRect;
  const flick = Math.sin(tMs / 45) * 0.5 + 0.5;
  ctx.save();
  ctx.globalAlpha = 0.05 + flick * 0.06;
  ctx.fillStyle = AMBER;
  for (let y = 0; y < p.h; y += 4) ctx.fillRect(0, y, p.w, 1.5);
  ctx.globalAlpha = 0.5;
  const scan = (tMs / 5) % (p.h + 40);
  const grad = ctx.createLinearGradient(0, scan - 20, 0, scan + 20);
  grad.addColorStop(0, "rgba(251,191,36,0)");
  grad.addColorStop(0.5, "rgba(251,191,36,0.35)");
  grad.addColorStop(1, "rgba(251,191,36,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, scan - 20, p.w, 40);
  ctx.restore();
};

// --- finale: missiles ---------------------------------------------------------

/** Stub instance so the finale painter satisfies the uniform Painter signature. */
export const FINALE_INST: EventInstance = {
  defId: "finale-missiles",
  family: "invasion",
  act: "finale",
  phase: "peak",
  phaseElapsedMs: 0,
  scheduledAtMs: 0,
  data: undefined,
};

const paintFinaleMissiles: Painter = (ctx, _inst, layout, g, tMs, hits) => {
  const p = layout.panelRect;
  const finale = g.finale;
  if (!finale) return;
  const data = finale.data.missiles as MissilesData | undefined;
  if (!data) return;

  for (const m of data.missiles) {
    const x = 20 + m.x * (p.w - 40);
    if (m.state === "falling") {
      const t = Math.min(1, (finale.phaseElapsedMs - m.launchedAtMs) / MISSILE_FALL_MS);
      const y = t * (p.h - 20);
      // A generous click target around the warhead so a falling missile is catchable.
      hits.push({
        shape: "circle",
        x,
        y,
        w: 0,
        h: 0,
        r: 22,
        target: { kind: "missile", id: m.id },
      });
      // streak
      ctx.save();
      const grad = ctx.createLinearGradient(x, y - 40, x, y);
      grad.addColorStop(0, "rgba(248,113,113,0)");
      grad.addColorStop(1, "rgba(248,113,113,0.9)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y - 40);
      ctx.lineTo(x, y);
      ctx.stroke();
      withGlow(ctx, RED, 16, () => {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fecaca";
        ctx.fill();
      });
      ctx.restore();
    } else if (m.state === "intercepted") {
      // interception burst: an expanding ring where Gerald caught it
      const t = (tMs / 400) % 1;
      const y = (0.5 + m.x * 0.2) * (p.h - 20);
      withGlow(ctx, GREEN, 20, () => {
        ctx.beginPath();
        ctx.arc(x, y, 6 + t * 22, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(74,222,128,${1 - t})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      });
    } else if (m.state === "landed") {
      // ground flash at the bottom
      withGlow(ctx, RED, 24, () => {
        ctx.beginPath();
        ctx.ellipse(x, p.h - 10, 26, 8, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(248,113,113,0.5)";
        ctx.fill();
      });
    }
  }
};

// --- registry -----------------------------------------------------------------

export const PAINTERS: Record<string, Painter> = {
  gerald: paintGerald,
  campfire: paintCampfire,
  garden: paintGarden,
  infection: paintInfection,
  "black-hole": paintBlackHole,
  parasite: paintParasite,
  galaga: paintGalaga,
  snake: paintSnake,
  tetris: paintTetris,
  "cookie-banner": paintChromeTelegraph,
  autocorrect: paintChromeTelegraph,
  "loading-bar": paintChromeTelegraph,
  "finale-missiles": paintFinaleMissiles,
};
