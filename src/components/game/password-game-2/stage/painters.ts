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
 * px. Painters are pure functions of (data, layout, time) with no retained state.
 * Keep per-frame allocation low.
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
import type { AutocorrectData } from "../engine/events/autocorrect";
import { MISSILE_FALL_MS, type MissilesData } from "../engine/events/finale";
import { hudSlots } from "./hud-slots";
import { ART_SCALE, hitRadius } from "./art-scale";

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
  /** The HUD band across the card's top (timer, seed, mute, exit), or null if unmounted. */
  hudRect: RectLike | null;
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
  /** A glyph target's own box: all a fine pointer gets (see hit-test.ts). */
  core?: RectLike;
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
  core?: RectLike,
) {
  hits.push({ shape: "rect", x, y, w, h, r: 0, target, core });
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

/** The painter's ART_SCALE factor (1 for an id the table does not know). */
function artScale(id: string): number {
  return ART_SCALE[id] ?? 1;
}

/**
 * Narrow `scale` so art reaching `extent` CSS px (at scale 1) from (cx, cy) stays on the
 * stage card. Art anchored near an edge shrinks a little instead of drawing off the card.
 */
function fitScale(scale: number, cx: number, cy: number, extent: number, p: RectLike): number {
  const room = Math.min(cx - p.x, p.x + p.w - cx, cy - p.y, p.y + p.h - cy);
  return Math.max(0, Math.min(scale, room / extent));
}

/** Clamp v into [lo, hi] (lo wins when the range is empty). */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
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

// Inhabitant HUD slot convention — gerald, campfire, and garden never resolve
// before the finale, so the director co-schedules them into the ONE shared
// boxRect and their always-on HUD elements would otherwise share coordinates.
// Crisis meters never draw on the password: they live in the reserved bands
// hudSlots() derives from the box, stacked in the top band's left column (row 0
// garden HIVE, row 1 gerald GERALD; campfire FUEL keeps its own bottom band).
// The action chips (FEED, BASKET, STOKE) are DOM buttons in hud-actions.tsx, not
// canvas art. Any new always-on meter claims the next free slot - never reuse one.
const METER_ROW_H = 22; // vertical stride between stacked crisis meters
const METER_W = 120; // crisis meter bar width
const METER_PAD = 16; // inset of a meter from its band's left edge
const METER_ROW_Y = 22; // first meter bar sits this far below the top of its band

export function drawCrisisMeter(ctx: CanvasRenderingContext2D, spec: MeterSpec): void {
  const { x, y, w, value, max, threshold, label, color } = spec;
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const valueText = spec.valueText ?? `${Math.round(value)}`;

  ctx.save();
  ctx.textBaseline = "alphabetic";
  // Name tag (left) and readout (right) on the line above the bar.
  ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(148,163,184,0.9)";
  ctx.fillText(label, x, y - 5);
  ctx.textAlign = "right";
  ctx.fillStyle = color;
  ctx.fillText(valueText, x + w, y - 5);

  // Track.
  roundRect(ctx, x, y, w, METER_BAR_H, METER_BAR_H / 2);
  ctx.fillStyle = "rgba(15,23,42,0.14)";
  ctx.fill();
  // Fill.
  if (frac > 0) {
    roundRect(ctx, x, y, w * frac, METER_BAR_H, METER_BAR_H / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  // Pass/fail tick.
  if (threshold !== undefined && max > 0) {
    const tx = x + w * Math.max(0, Math.min(1, threshold / max));
    ctx.fillStyle = "rgba(226,232,240,0.9)";
    ctx.fillRect(tx - 1, y - 2, 2, METER_BAR_H + 4);
  }
  ctx.restore();
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

// Display-only mirrors of gerald.ts MURKY_AT / the moodFor "hungry" tier: the
// hunger levels at which the water goes murky (gauge turns loud) and the tier
// word flips to HUNGRY. The engine owns the real values.
const GERALD_MURKY_AT = 85;
const GERALD_HUNGRY_AT = 60;

const paintGerald: Painter = (ctx, inst, layout, _g, tMs) => {
  const box = layout.boxRect;
  if (!box) return;
  const d = inst.data as GeraldData;
  const S = artScale("gerald");

  if (inst.phase === "telegraph") {
    // Telegraph: bubbles rising in the box's bottom-left corner.
    const bx = box.x + 26 * S;
    for (let i = 0; i < 5; i++) {
      const t = (tMs / 1400 + i * 0.37) % 1;
      const y = box.y + box.h - 8 - t * (box.h * 0.5);
      bubble(ctx, bx + Math.sin(t * 6 + i) * 8 * S, y, (2 + i * 0.6) * S, (1 - t) * 0.8);
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
  // The fish reaches 27 px either side of its centre at scale 1; keep it in the water.
  const margin = 30 * S;
  const swimW = box.w - 2 * margin;
  const swX = box.x + margin + (0.5 + 0.5 * Math.sin(tMs / 1600)) * Math.max(0, swimW);
  const swY = starved ? waterY + 12 : waterY + box.h * 0.28 + Math.sin(tMs / 700) * 6;
  drawFish(ctx, swX, swY, S, Math.cos(tMs / 1600) >= 0 ? 1 : -1, starved, d.murky);

  // Hunger gauge — always visible; loud (red, pulsing) once hunger reaches the
  // murky threshold, calm green below. The bar fills as Gerald starves; the
  // readout is a short tier word so high-vs-low reads without a legend. Meter
  // row 1 (below garden HIVE) per the inhabitant HUD slot convention.
  const loud = d.hunger >= GERALD_MURKY_AT;
  const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(tMs / 160));
  const tier =
    d.hunger >= GERALD_MURKY_AT ? "STARVING" : d.hunger >= GERALD_HUNGRY_AT ? "HUNGRY" : "FED";
  const slots = hudSlots(layout);
  if (slots) {
    drawCrisisMeter(ctx, {
      x: slots.meter.x + METER_PAD,
      y: slots.meter.y + METER_ROW_Y + METER_ROW_H,
      w: Math.min(METER_W, slots.meter.w - METER_PAD),
      value: d.hunger,
      max: 100,
      label: "GERALD",
      valueText: tier,
      color: loud ? `rgba(248,113,113,${pulse})` : GREEN,
    });
  }
};

// --- campfire -----------------------------------------------------------------

function drawFlame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  t: number,
  hue: string,
  w = 1, // width factor (ART_SCALE)
) {
  const flick = 1 + Math.sin(t) * 0.12;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - 9 * w, y - h * 0.5, x - 3 * w, y - h * 0.72 * flick);
  ctx.quadraticCurveTo(x - 7 * w, y - h * 0.55, x, y - h * flick);
  ctx.quadraticCurveTo(x + 7 * w, y - h * 0.55, x + 3 * w, y - h * 0.72 * flick);
  ctx.quadraticCurveTo(x + 9 * w, y - h * 0.5, x, y);
  ctx.closePath();
  ctx.fillStyle = hue;
  ctx.fill();
}

const paintCampfire: Painter = (ctx, inst, layout, _g, tMs) => {
  const box = layout.boxRect;
  if (!box) return;
  const d = inst.data as CampfireData;
  const S = artScale("campfire");

  if (inst.phase === "telegraph") {
    // Telegraph: drifting smoke wisps at the box bottom.
    const sx = box.x + box.w * 0.5;
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const t = (tMs / 2200 + i * 0.33) % 1;
      ctx.beginPath();
      const baseY = box.y + box.h - 6;
      ctx.moveTo(sx + (i - 1) * 14 * S, baseY);
      for (let s = 0; s <= 1; s += 0.2) {
        ctx.lineTo(
          sx + (i - 1) * 14 * S + Math.sin(s * 7 + t * 6 + i) * 12 * S * s,
          baseY - s * box.h * 0.55 * (0.6 + t * 0.5),
        );
      }
      ctx.strokeStyle = `rgba(148,163,184,${(1 - t) * 0.35})`;
      ctx.lineWidth = (3 + t * 5) * S;
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
    roundRect(ctx, -26 * S, -5 * S, 52 * S, 10 * S, 5 * S);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  if (d.burning) {
    const scale = (0.5 + (d.fuel / 100) * 0.9) * S;
    withGlow(ctx, "#fb923c", 22, () => {
      drawFlame(ctx, fx, fy - 2, 54 * scale, tMs / 120, "#f97316", S);
      drawFlame(ctx, fx - 6 * S, fy - 2, 38 * scale, tMs / 90 + 1, "#fbbf24", S);
      drawFlame(ctx, fx + 6 * S, fy - 2, 40 * scale, tMs / 100 + 2, "#f59e0b", S);
      drawFlame(ctx, fx, fy - 2, 22 * scale, tMs / 70 + 3, "#fde68a", S);
    });
    // embers rising
    for (let i = 0; i < 6; i++) {
      const t = (tMs / 1100 + i * 0.31) % 1;
      ctx.beginPath();
      ctx.arc(
        fx + Math.sin(t * 8 + i) * 16 * S,
        fy - 10 - t * 70 * scale,
        1.6 * S * (1 - t),
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
      ctx.ellipse(fx, fy - 2, 20 * S, 6 * S, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(124,45,18,0.8)";
      ctx.fill();
    });
  }

  // Fuel gauge above the fire — its own bottom slot per the slot convention, so
  // it never collides with the top-left meter column garden and gerald share.
  const slots = hudSlots(layout);
  if (slots) {
    drawCrisisMeter(ctx, {
      x: slots.bottom.x + METER_PAD,
      y: slots.bottom.y + METER_ROW_Y,
      w: Math.min(METER_W, slots.bottom.w - METER_PAD),
      value: d.fuel,
      max: 100,
      label: "FUEL",
      color: d.fuel < 25 ? RED : "#f59e0b",
    });
  }
};

// --- garden -------------------------------------------------------------------

function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
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

// Display-only mirrors of garden.ts MIN_HONEY / RAID_DURATION_MS /
// BEAR_TELEGRAPH_MS; the engine owns the real values, the painter only reads
// them to draw the hive meter, drain, and countdown arc.
const HIVE_THRESHOLD = 40;
const GARDEN_RAID_MS = 6000;
const GARDEN_TELEGRAPH_MS = 8000;

const paintGarden: Painter = (ctx, inst, layout, g, tMs) => {
  const box = layout.boxRect;
  if (!box) return;
  const d = inst.data as GardenData;
  const S = artScale("garden");

  if (inst.phase === "telegraph") {
    // Telegraph: vines creeping in from the box's left edge.
    ctx.save();
    ctx.strokeStyle = "rgba(22,163,74,0.75)";
    ctx.lineWidth = 3 * S;
    ctx.lineCap = "round";
    const grow = Math.min(1, inst.phaseElapsedMs / 6000);
    for (let i = 0; i < 3; i++) {
      const baseY = box.y + box.h * (0.35 + i * 0.25);
      ctx.beginPath();
      ctx.moveTo(box.x, baseY);
      const len = box.w * 0.4 * grow;
      for (let s = 0; s <= len; s += 10) {
        ctx.lineTo(box.x + s, baseY + Math.sin(s / 20 + i + tMs / 900) * 8 * S);
      }
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // Flowers along the box bottom (bloomed 0..3).
  const n = Math.max(0, Math.min(3, d.bloomed));
  for (let i = 0; i < n; i++) {
    drawFlower(ctx, box.x + (40 + i * 46) * S, box.y + box.h - 8, tMs / 700 + i, S);
  }
  // Honey meter — always visible; loud (red, pulsing) while the hive sits below
  // the rule threshold, calm amber above. During a raid the readout ticks toward
  // zero across the raid window (display-only; the engine snaps at raid end).
  // Meter row 0 (top-left) per the inhabitant HUD slot convention.
  const raidProgress =
    d.bearState === "raiding"
      ? Math.max(0, Math.min(1, (g.elapsedMs - (d.raidEndsAtMs - GARDEN_RAID_MS)) / GARDEN_RAID_MS))
      : 0;
  const displayHoney = Math.round(d.honey * (1 - raidProgress));
  const loud = displayHoney < HIVE_THRESHOLD;
  const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(tMs / 160));
  const slots = hudSlots(layout);
  if (slots) {
    drawCrisisMeter(ctx, {
      x: slots.meter.x + METER_PAD,
      y: slots.meter.y + METER_ROW_Y,
      w: Math.min(METER_W, slots.meter.w - METER_PAD),
      value: displayHoney,
      max: 100,
      threshold: HIVE_THRESHOLD,
      label: "HIVE",
      valueText: String(displayHoney),
      color: loud ? `rgba(248,113,113,${pulse})` : AMBER,
    });
  }

  // The bear: a looming shadow with a shrinking countdown arc when telegraphed,
  // the lumbering silhouette when raiding.
  if (d.bearState === "telegraphed") {
    const bx = box.x + box.w * 0.5;
    const by = box.y + 30;
    const bearPulse = 0.3 + 0.15 * Math.sin(tMs / 300);
    drawBear(ctx, bx, by, 0.8 * S, bearPulse);
    // The arc empties as the raid nears.
    const remain = Math.max(0, Math.min(1, (d.nextBearAtMs - g.elapsedMs) / GARDEN_TELEGRAPH_MS));
    ctx.save();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 3 * S;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(bx, by, 34 * S, -Math.PI / 2, -Math.PI / 2 + remain * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (d.bearState === "raiding") {
    // The bear lumbers in from the box's left edge (its body reaches 40 px behind its centre).
    const bs = 1.1 * S;
    const t = Math.min(1, inst.phaseElapsedMs / 800);
    const bx = box.x + 40 * bs + t * box.w * 0.4;
    drawBear(ctx, bx, box.y + box.h * 0.5 + Math.sin(tMs / 200) * 4, bs, 1);
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
    const band = 60 * artScale("infection");
    const grad = ctx.createLinearGradient(cx - band, 0, cx + band, 0);
    grad.addColorStop(0, "rgba(34,197,94,0)");
    grad.addColorStop(0.5, "rgba(34,197,94,0.28)");
    grad.addColorStop(1, "rgba(34,197,94,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.restore();
    return;
  }

  // Peak: pulsing spore glow over each infected/mutated cell, with drifting spores.
  const S = artScale("infection");
  for (const cell of g.cells) {
    if (cell.status !== "infected" && cell.status !== "mutated") continue;
    const r = layout.cellRects.get(cell.id);
    if (!r) continue;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const pulse = 0.5 + 0.5 * Math.sin(tMs / 260 + cell.id);
    withGlow(ctx, GREEN, (8 + pulse * 10) * S, () => {
      ctx.beginPath();
      ctx.arc(cx, cy, (3 + pulse * 2) * S, 0, Math.PI * 2);
      ctx.fillStyle = cell.status === "mutated" ? "rgba(22,101,52,0.6)" : "rgba(34,197,94,0.5)";
      ctx.fill();
    });
    for (let i = 0; i < 3; i++) {
      const t = (tMs / 1300 + i * 0.33 + cell.id * 0.1) % 1;
      ctx.beginPath();
      ctx.arc(
        cx + Math.sin(t * 7 + cell.id) * 10 * S,
        cy - t * 18 * S,
        1.4 * S * (1 - t),
        0,
        Math.PI * 2,
      );
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
  const p = layout.panelRect;

  if (inst.phase === "telegraph") {
    // Telegraph: space-distortion warp lines converging on the anchor (86 px reach at 1x,
    // plus half the 1.5 px stroke), kept a pixel inside the card so a line's anti-aliased
    // end is not clipped at the edge.
    const inner = { x: p.x + 1, y: p.y + 1, w: p.w - 2, h: p.h - 2 };
    const S = fitScale(artScale("black-hole"), cx, cy, 86.75, inner);
    ctx.save();
    ctx.strokeStyle = "rgba(167,139,250,0.55)";
    ctx.lineWidth = 1.5 * S;
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + tMs / 1400;
      const r0 = (46 + ((tMs / 18 + i * 12) % 40)) * S;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * (r0 - 16 * S), cy + Math.sin(ang) * (r0 - 16 * S));
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // The swirl reaches the outermost captured glyph (34 px + 3 per capture, plus the glyph).
  const S = fitScale(artScale("black-hole"), cx, cy, 44 + d.capturedIds.length * 3, p);

  // Peak: an accretion disk swirling into a dark core.
  ctx.save();
  ctx.translate(cx, cy);
  withGlow(ctx, VIOLET, 26 * S, () => {
    for (let ring = 0; ring < 4; ring++) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(167,139,250,${0.5 - ring * 0.1})`;
      ctx.lineWidth = (3 - ring * 0.5) * S;
      const rr = (14 + ring * 8) * S;
      ctx.ellipse(0, 0, rr, rr * 0.5, tMs / 700 + ring, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  // dark core
  const coreR = 16 * S;
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
  core.addColorStop(0, "#0b0714");
  core.addColorStop(0.7, "#1e1033");
  core.addColorStop(1, "rgba(30,16,51,0)");
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, Math.PI * 2);
  ctx.fillStyle = core;
  ctx.fill();
  ctx.restore();

  // Captured cells spiralling in.
  d.capturedIds.forEach((id, i) => {
    const cell = g.cells.find((c) => c.id === id);
    const glyph = cell?.ch ?? "?";
    const ang = tMs / 500 + i * 1.3;
    const rad = (34 + i * 3) * S;
    ctx.save();
    ctx.font = `600 ${Math.round(18 * S)}px ui-monospace, monospace`;
    ctx.fillStyle = "rgba(196,181,253,0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(glyph, cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.6);
    ctx.restore();
  });

  // The heavy-word label riding the swirl, kept on the card when the anchor is near an edge.
  ctx.save();
  ctx.font = "800 13px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = `COMPACTION — FEED IT: ${d.heavyWord}`;
  const lw = ctx.measureText(label).width + 16;
  const lx = clamp(cx, p.x + lw / 2 + 4, p.x + p.w - lw / 2 - 4);
  const ly = cy - 36 * S;
  roundRect(ctx, lx - lw / 2, ly - 10, lw, 20, 6);
  ctx.fillStyle = "rgba(30,16,51,0.9)";
  ctx.fill();
  ctx.fillStyle = VIOLET;
  ctx.fillText(label, lx, ly);
  ctx.restore();
};

// --- parasite -----------------------------------------------------------------

const paintParasite: Painter = (ctx, inst, layout, g, tMs, hits) => {
  const d = inst.data as ParasiteData;
  // The tell fires for 300ms every 6s, derived from phase time. Hit rects are
  // registered EVERY frame so a click always evicts, but the glyph only shows
  // inside the wiggle window — silent dramatic irony the rest of the time.
  const wiggling = inst.phase !== "telegraph" && inst.phaseElapsedMs % 6000 < 300;
  const S = artScale("parasite");
  for (const id of d.parasiteIds) {
    const cell = g.cells.find((c) => c.id === id);
    if (!cell) continue;
    const r = layout.cellRects.get(id);
    if (!r) continue;
    // The target is the cell plus 2 px a side, but never under 44 px across a narrow glyph.
    // The floor is for touch only: pickHit trims it to the glyph's own box (core) for a
    // fine pointer, and never lets it reach into a neighbouring glyph.
    const hw = Math.max(44, r.w + 4);
    const hh = Math.max(44, r.h + 4);
    pushRect(
      hits,
      r.x + r.w / 2 - hw / 2,
      r.y + r.h / 2 - hh / 2,
      hw,
      hh,
      { kind: "parasite", id },
      r,
    );
    if (!wiggling) continue;
    // Reveal-window tell: a bright ring pulsing around the mimic, lighter than the
    // violet glyph glow so an attentive player can catch it against the force accent.
    const ringPulse = 0.5 + 0.5 * Math.sin(tMs / 110);
    const pad = 3 * S;
    ctx.save();
    ctx.lineWidth = 2 * S;
    withGlow(ctx, "#ddd6fe", 10 * S, () => {
      roundRect(ctx, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, 6);
      ctx.strokeStyle = `rgba(221,214,254,${0.45 + 0.5 * ringPulse})`;
      ctx.stroke();
    });
    ctx.restore();
    const wob = Math.sin(tMs / 40) * 3 * S;
    ctx.save();
    ctx.font = `600 ${Math.round(r.h * 0.8)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    withGlow(ctx, VIOLET, 12 * S, () => {
      ctx.fillStyle = VIOLET;
      ctx.fillText(cell.ch, r.x + r.w / 2 + wob, r.y + r.h / 2 + Math.cos(tMs / 40) * 2 * S);
    });
    ctx.restore();
  }
};

// --- galaga -------------------------------------------------------------------

const COLS = 6;

/** Formation column spacing: ART_SCALE-wide, narrowed so six columns fit the card. */
function fleetSpacing(panel: RectLike): number {
  return Math.min(46 * artScale("galaga"), (panel.w - 60) / COLS);
}

/** The fleet's scale: ART_SCALE, narrowed with the spacing so wings never overlap. */
function fleetScale(panel: RectLike): number {
  return Math.min(artScale("galaga"), fleetSpacing(panel) / 40);
}

// The glow drawAlien wraps a ship in, outside the carrying flare.
const SHIP_GLOW = 8;

/**
 * How far a ship reaches from its centre: the wingtips (19 px across, 9 up at scale 1) and
 * their glow, or the tap target where that is larger.
 */
function shipReach(s: number): { x: number; y: number } {
  const r = hitRadius(16, s);
  return { x: Math.max(r, 19 * s + SHIP_GLOW), y: Math.max(r, 9 * s + SHIP_GLOW) };
}

function alienSlot(
  layout: StageLayout,
  box: RectLike,
  formationIndex: number,
  assembled: number,
): { x: number; y: number } {
  const panel = layout.panelRect;
  const col = formationIndex % COLS;
  const row = Math.floor(formationIndex / COLS);
  const s = fleetScale(panel);
  const cx = box.x + box.w / 2 + (col - (COLS - 1) / 2) * fleetSpacing(panel);
  // The top row sits a ship's reach under the HUD band, so no ship covers (or steals a
  // tap from) the timer, seed, mute or exit.
  const hud = layout.hudRect;
  const top = (hud ? hud.y + hud.h : panel.y) + shipReach(s).y;
  const targetY = top + row * 30 * s;
  // during assembly, the lower row drops into place from the top row
  const y = top + assembled * (targetY - top);
  return { x: cx, y };
}

function drawAlien(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  carrying: boolean,
  scale: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
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
  const s = fleetScale(panel);
  // Keep the whole ship, glow and target on the card, however it sways or dives.
  const reach = shipReach(s).x;
  const minX = panel.x + reach;
  const maxX = panel.x + panel.w - reach;

  // Assembly progress: telegraph slides the fleet in row by row.
  const assembled = inst.phase === "telegraph" ? Math.min(1, inst.phaseElapsedMs / 9000) : 1;

  for (const a of d.aliens as Alien[]) {
    if (a.state === "fled" || a.state === "down") continue;
    const slot = alienSlot(layout, box, a.formationIndex, assembled);
    let x = clamp(slot.x + Math.sin(tMs / 600 + a.formationIndex) * 3, minX, maxX);
    let y = slot.y;

    if (a.state === "diving" && a.diveStartedAtMs !== null) {
      // 2000 mirrors galaga.ts GRAB_DELAY_MS: the dive must visually reach the
      // box exactly when the engine grabs the glyph.
      const t = Math.min(1, (g.elapsedMs - a.diveStartedAtMs) / 2000);
      y = slot.y + t * (box.y + box.h * 0.6 - slot.y);
      x = clamp(slot.x + Math.sin(t * 6) * 40 * s, minX, maxX);
    } else if (a.state === "carrying") {
      // rising back to formation with a stolen glyph
      const t =
        a.diveStartedAtMs !== null ? Math.min(1, (g.elapsedMs - a.diveStartedAtMs) / 3000) : 0;
      y = box.y + box.h * 0.4 - t * (box.h * 0.4);
      x = clamp(slot.x, minX, maxX);
      const cell =
        a.carriedCellId !== null ? g.cells.find((c) => c.id === a.carriedCellId) : undefined;
      if (cell) {
        ctx.save();
        ctx.font = `600 ${Math.round(16 * s)}px ui-monospace, monospace`;
        ctx.fillStyle = "#fecaca";
        ctx.textAlign = "center";
        ctx.fillText(cell.ch, x, y + 20 * s);
        ctx.restore();
      }
    }

    drawAlien(ctx, x, y, tMs / 140 + a.formationIndex, a.state === "carrying", s);
    if (a.state === "formation" || a.state === "diving") {
      pushCircle(hits, x, y, hitRadius(16, s), { kind: "alien", id: a.id });
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
    const S = artScale("snake");
    ctx.save();
    ctx.strokeStyle = "rgba(248,113,113,0.6)";
    ctx.lineWidth = 2 * S;
    ctx.lineCap = "round";
    for (let x = box.x + 12; x < box.x + box.w - 12; x += 12) {
      const sway = Math.sin(x / 18 + tMs / 300) * 5 * S;
      ctx.beginPath();
      ctx.moveTo(x, box.y + box.h - 4);
      ctx.lineTo(x + sway, box.y + box.h - 16 * S);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // Peak: a slithering snake whose body lumps grow with each swallowed letter.
  const S = artScale("snake");
  const segs = 6 + d.swallowedIds.length;
  const midY = box.y + box.h * 0.68;
  const reach = 40 * S; // head plus tongue, kept off the box's sides
  const headX = box.x + reach + (0.5 + 0.5 * Math.sin(tMs / 1400)) * (box.w - reach * 2);
  const dir = Math.cos(tMs / 1400) >= 0 ? -1 : 1; // body trails behind the head
  ctx.save();
  ctx.lineCap = "round";
  for (let i = segs - 1; i >= 0; i--) {
    // A long, well-fed body bunches up against the box's edge rather than leave it.
    const x = clamp(headX + dir * i * 15 * S, box.x + 12 * S, box.x + box.w - 12 * S);
    const y = midY + Math.sin(i * 0.6 + tMs / 300) * 8 * S;
    const swollen = i > 0 && i <= d.swallowedIds.length;
    const rad = (swollen ? 11 : 8) * S;
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
        ctx.font = `600 ${Math.round(11 * S)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(cell.ch, x, y);
      }
    }
    if (i === 0) {
      // eyes + flicking tongue
      ctx.fillStyle = "#0b1220";
      ctx.beginPath();
      ctx.arc(x - dir * 3 * S, y - 3 * S, 1.6 * S, 0, Math.PI * 2);
      ctx.arc(x - dir * 3 * S, y + 3 * S, 1.6 * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.4 * S;
      ctx.beginPath();
      const tongue = (8 + Math.abs(Math.sin(tMs / 120)) * 6) * S;
      ctx.moveTo(x - dir * 10 * S, y);
      ctx.lineTo(x - dir * (10 * S + tongue), y);
      ctx.stroke();
    }
  }
  ctx.restore();

  // The pellet it hunts (a glowing target glyph).
  const pelletX = box.x + box.w - 30 * S;
  const pelletY = box.y + box.h - 30 * S;
  ctx.save();
  withGlow(ctx, RED, 14, () => {
    ctx.beginPath();
    ctx.arc(pelletX, pelletY, 10 * S, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(248,113,113,0.25)";
    ctx.fill();
  });
  ctx.fillStyle = RED;
  ctx.font = `700 ${Math.round(15 * S)}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(d.pelletChar, pelletX, pelletY);
  ctx.restore();

  // The feed instruction, in the black-hole FEED IT: idiom.
  ctx.save();
  ctx.font = "800 13px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = `FEED: ${d.pelletChar} — AT THE END`;
  const lw = ctx.measureText(label).width + 16;
  const lx = box.x + box.w / 2;
  const ly = box.y + 14;
  roundRect(ctx, lx - lw / 2, ly - 10, lw, 20, 6);
  ctx.fillStyle = "rgba(32,11,11,0.9)";
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.fillText(label, lx, ly);
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
  const S = artScale("tetris");
  const s = 26 * S;

  const colFor = (targetIndex: number) =>
    box.x + 24 + (((targetIndex % 22) + 0.5) / 22) * (box.w - 48);

  if (inst.phase === "telegraph") {
    // Telegraph: block shadows sliding across the strip above the box.
    for (let i = 0; i < 5; i++) {
      const x = box.x + 24 + ((tMs / 40 + i * 90) % (box.w - 48));
      drawBlock(ctx, x, box.y - 22 * S, s, "", true);
    }
    return;
  }

  for (const drop of d.drops) {
    if (drop.landed) continue;
    // 2500 mirrors tetris.ts LAND_DELAY_MS: the block must visually touch down
    // exactly when the engine wedges the garbage cell in.
    const t = Math.min(1, (g.elapsedMs - drop.startAtMs) / 2500);
    const x = colFor(drop.targetIndex);
    const y = box.y - 24 * S + t * (box.h * 0.5 + 24 * S);
    drawBlock(ctx, x, box.y + box.h * 0.5, s, "", true); // landing-zone ghost
    // A queued drop has not left yet; it used to be drawn far above the card, unseen.
    if (t >= 0) drawBlock(ctx, x, y, s, drop.char, false);
  }

  // A one-time nudge above the first landed block, retired the moment the player
  // shatters their first garbage.
  if (!d.hasShattered) {
    const firstGarbage = g.cells.find((c) => c.status === "garbage" && c.eventTag === "tetris");
    const r = firstGarbage ? layout.cellRects.get(firstGarbage.id) : undefined;
    if (r) {
      ctx.save();
      ctx.font = "800 12px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = "CLICK TO SHATTER";
      const lw = ctx.measureText(label).width + 14;
      const p = layout.panelRect;
      const lx = clamp(r.x + r.w / 2, p.x + lw / 2 + 4, p.x + p.w - lw / 2 - 4);
      const ly = r.y - 14;
      roundRect(ctx, lx - lw / 2, ly - 9, lw, 18, 5);
      ctx.fillStyle = "rgba(32,11,11,0.9)";
      ctx.fill();
      ctx.fillStyle = RED;
      ctx.fillText(label, lx, ly);
      ctx.restore();
    }
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
  const half = 20 * artScale(inst.defId);
  const scan = (tMs / 5) % p.h;
  const grad = ctx.createLinearGradient(0, scan - half, 0, scan + half);
  grad.addColorStop(0, "rgba(251,191,36,0)");
  grad.addColorStop(0.5, "rgba(251,191,36,0.35)");
  grad.addColorStop(1, "rgba(251,191,36,0)");
  ctx.fillStyle = grad;
  // The band's rect is cut to the card; its soft edge still sweeps in and out.
  const top = Math.max(0, scan - half);
  ctx.fillRect(0, top, p.w, Math.min(p.h, scan + half) - top);
  ctx.restore();
};

// The rewrite flash lingers this long after the demon strikes; mirrors nothing
// in the engine (a display-only fade), so the painter owns it.
const AUTOCORRECT_FLASH_MS = 1000;

const paintAutocorrect: Painter = (ctx, inst, layout, g, tMs, hits) => {
  if (inst.phase === "telegraph") {
    paintChromeTelegraph(ctx, inst, layout, g, tMs, hits);
    return;
  }
  // Peak: when the demon has just rewritten cells, ring them in amber for ~1s so
  // the silent splice has a visible tell to go with its toast.
  const d = inst.data as AutocorrectData;
  const since = g.elapsedMs - d.lastRewriteAtMs;
  if (since < 0 || since >= AUTOCORRECT_FLASH_MS) return;
  const fade = 1 - since / AUTOCORRECT_FLASH_MS; // 1 -> 0 across the window
  const pulse = 0.5 + 0.5 * Math.sin(tMs / 90);
  const S = artScale("autocorrect");
  const pad = 2 * S;
  ctx.save();
  ctx.lineWidth = 2.5 * S;
  for (const id of d.lastRewriteCellIds) {
    const r = layout.cellRects.get(id);
    if (!r) continue;
    withGlow(ctx, AMBER, 12 * fade, () => {
      roundRect(ctx, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, 5);
      ctx.strokeStyle = `rgba(251,191,36,${fade * (0.6 + 0.4 * pulse)})`;
      ctx.stroke();
    });
  }
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

  const S = artScale("finale-missiles");
  // Side margin: the widest piece (the landed ground flash) stays on the card.
  const margin = 26 * S + 4;
  const streak = 40 * S;
  for (const m of data.missiles) {
    const x = margin + m.x * (p.w - margin * 2);
    if (m.state === "falling") {
      const t = Math.min(1, (finale.phaseElapsedMs - m.launchedAtMs) / MISSILE_FALL_MS);
      // The streak trails the warhead, so the fall starts one streak below the top edge.
      const y = streak + t * (p.h - 20 - streak);
      // A generous click target around the warhead so a falling missile is catchable.
      hits.push({
        shape: "circle",
        x,
        y,
        w: 0,
        h: 0,
        r: hitRadius(22, S),
        target: { kind: "missile", id: m.id },
      });
      // streak
      ctx.save();
      const grad = ctx.createLinearGradient(x, y - streak, x, y);
      grad.addColorStop(0, "rgba(248,113,113,0)");
      grad.addColorStop(1, "rgba(248,113,113,0.9)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3 * S;
      ctx.beginPath();
      ctx.moveTo(x, y - streak);
      ctx.lineTo(x, y);
      ctx.stroke();
      withGlow(ctx, RED, 16, () => {
        ctx.beginPath();
        ctx.arc(x, y, 4 * S, 0, Math.PI * 2);
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
        ctx.arc(x, y, (6 + t * 22) * S, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(74,222,128,${1 - t})`;
        ctx.lineWidth = 3 * S;
        ctx.stroke();
      });
    } else if (m.state === "landed") {
      // ground flash at the bottom
      withGlow(ctx, RED, 24, () => {
        ctx.beginPath();
        ctx.ellipse(x, p.h - 10 * S, 26 * S, 8 * S, 0, 0, Math.PI * 2);
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
  autocorrect: paintAutocorrect,
  "loading-bar": paintChromeTelegraph,
  "finale-missiles": paintFinaleMissiles,
};
