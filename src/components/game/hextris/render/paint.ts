import { SIDES, START_LIMIT_ROWS, rotationOffset } from "../engine/state";
import type { Cell, RunState } from "../engine/types";
import {
  COMBO_TEXT_FILL,
  POPUP_MS,
  TEXT_OUTLINE_PX,
  TEXT_OUTLINE_STYLE,
  type ShownPopup,
} from "./juice";
import { type Layout, ringRadius } from "./layout";

// The painter: a pure function of (state, layout, nowMs, popups) onto a 2D context. It reads the
// run and never writes to it or draws random numbers. `nowMs` is on the run clock (`elapsedMs`,
// plus any part-tick the shell has accumulated), which drives the rotation ease, the combo ring
// and the popups. The shell keeps the popups (from popupFor) and drops them after POPUP_MS.
// Once the run is over the shell also passes an `ending`, whose animation runs on its own clock.

/** What paint needs to draw the end of a run. Given only once the run is over. */
export interface PaintEnding {
  /** The stack that overflowed, indexed like `state.sides` (the engine's game-over event). */
  side: number;
  newBest: boolean;
  /** Real ms since game over: 0 on the first frame after it, rising while the run clock stands. */
  sinceMs: number;
}

/** The subset of CanvasRenderingContext2D the painter uses, so tests can pass a recorder. */
export interface PaintCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  stroke(): void;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
}

export const PALETTE: readonly string[] = ["#ef6f6c", "#4fb3bf", "#f6c85f", "#8f7cf7"];
export const RAINBOW_FILL = "#f4f1ea";
export const CORE_FILL = "#2b2d42";
export const LIMIT_STROKE = "rgba(255, 255, 255, 0.35)";
export const LIMIT_WARN_STROKE = "#ff9f1c";
export const COMBO_STROKE = "#ffffff";
const BOMB_MARK = "#1b1b1b";

const STEP = Math.PI / 3;
const TAN_HALF_STEP = Math.tan(STEP / 2);
const UP = -Math.PI / 2;
/** Fraction of a row left as a gap between neighbouring cells. */
const CELL_GAP = 0.06;
/** The combo ring sits inside the core, at this fraction of its apothem. */
const COMBO_RING_SCALE = 0.6;
// Text sizes: the combo level against the core, a combo-1 popup against a row, and a floor so
// text stays legible on a phone.
const COMBO_TEXT_SCALE = 0.55;
const POPUP_TEXT_ROWS = 1.2;
const MIN_TEXT_PX = 14;
/** A popup drifts this many rows outward over its life and fades over the last part of it. */
const POPUP_RISE_ROWS = 1;
const POPUP_FADE_FROM = 0.6;
// The ending: the board dims, and the overflowed side's band pulses red between two opacities.
const ENDING_DIM_ALPHA = 0.45;
const OVERFLOW_FILL = "#ff4d4d";
const OVERFLOW_ALPHA_MIN = 0.2;
const OVERFLOW_ALPHA_MAX = 0.55;
const OVERFLOW_PULSE_MS = 1000;
// The new-best burst: particles fan out from the core centre, a base-speed one ending a row past
// the start limit ring's corner, and fade over the last part of their life.
const BURST_COUNT = 36;
const BURST_STEP = (2 * Math.PI) / BURST_COUNT;
const BURST_SPEEDS = [0.8, 1, 1.2];
const BURST_MS = 1200;
const BURST_FADE_FROM = 0.6;

type Pt = [number, number];

/** The four corners of the band `from`..`to` rows out, on the side whose normal is `angle`. */
function band(l: Layout, angle: number, from: number, to: number): Pt[] {
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  const corner = (rows: number, side: 1 | -1): Pt => {
    const d = l.apothem + rows * l.rowHeight;
    const half = d * TAN_HALF_STEP * side;
    return [l.cx + nx * d - ny * half, l.cy + ny * d + nx * half];
  };
  return [corner(from, -1), corner(from, 1), corner(to, 1), corner(to, -1)];
}

function ring(l: Layout, rows: number, turn: number): Pt[] {
  const r = ringRadius(l, rows);
  return Array.from({ length: SIDES }, (_, i): Pt => {
    const a = UP + (i + turn) * STEP + STEP / 2;
    return [l.cx + Math.cos(a) * r, l.cy + Math.sin(a) * r];
  });
}

function trace(ctx: PaintCtx, points: Pt[]): void {
  ctx.beginPath();
  const [first, ...rest] = points;
  if (first) ctx.moveTo(first[0], first[1]);
  for (const [x, y] of rest) ctx.lineTo(x, y);
  ctx.closePath();
}

function fillOf(cell: Pick<Cell, "colour" | "special">): string {
  if (cell.special === "rainbow") return RAINBOW_FILL;
  return PALETTE[cell.colour] ?? RAINBOW_FILL;
}

function drawCell(
  ctx: PaintCtx,
  l: Layout,
  angle: number,
  rows: number,
  cell: Pick<Cell, "colour" | "special">,
): void {
  const corners = band(l, angle, rows + CELL_GAP, rows + 1 - CELL_GAP);
  ctx.fillStyle = fillOf(cell);
  trace(ctx, corners);
  ctx.fill();
  if (cell.special === "bomb") {
    // An inset outline marks a bomb without adding a fill in a piece colour.
    ctx.strokeStyle = BOMB_MARK;
    ctx.lineWidth = Math.max(1, l.rowHeight * 0.15);
    trace(ctx, band(l, angle, rows + 0.3, rows + 0.7));
    ctx.stroke();
  }
}

/** Centred text in a light fill inside the dark outline that keeps it readable (juice.ts). */
function outlinedText(
  ctx: PaintCtx,
  text: string,
  x: number,
  y: number,
  px: number,
  fill: string,
  alpha: number,
): void {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.font = `bold ${Math.round(px)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = TEXT_OUTLINE_PX;
  ctx.strokeStyle = TEXT_OUTLINE_STYLE;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = prev;
}

function drawPopup(ctx: PaintCtx, l: Layout, turn: number, popup: ShownPopup, nowMs: number): void {
  const life = (nowMs - popup.bornMs) / POPUP_MS;
  if (life < 0 || life >= 1) return;
  const angle = UP + (popup.side + turn) * STEP;
  const d = l.apothem + (popup.row + 0.5 + POPUP_RISE_ROWS * life) * l.rowHeight;
  const alpha = life < POPUP_FADE_FROM ? 1 : (1 - life) / (1 - POPUP_FADE_FROM);
  const px = Math.max(MIN_TEXT_PX, l.rowHeight * POPUP_TEXT_ROWS) * popup.scale;
  outlinedText(
    ctx,
    popup.text,
    l.cx + Math.cos(angle) * d,
    l.cy + Math.sin(angle) * d,
    px,
    popup.fill,
    alpha,
  );
}

/** The overflowed side's band in pulsing red, outlined, with its cells redrawn on top. */
function drawOverflow(
  ctx: PaintCtx,
  state: RunState,
  l: Layout,
  turn: number,
  ending: PaintEnding,
): void {
  const stack = state.sides[ending.side] ?? [];
  const angle = UP + (ending.side + turn) * STEP;
  const corners = band(l, angle, 0, Math.max(stack.length, state.limitRows) + 1);
  const mid = (OVERFLOW_ALPHA_MAX + OVERFLOW_ALPHA_MIN) / 2;
  const swing = (OVERFLOW_ALPHA_MAX - OVERFLOW_ALPHA_MIN) / 2;
  ctx.globalAlpha = mid + swing * Math.cos((2 * Math.PI * ending.sinceMs) / OVERFLOW_PULSE_MS);
  ctx.fillStyle = OVERFLOW_FILL;
  trace(ctx, corners);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = OVERFLOW_FILL;
  ctx.lineWidth = limitLineWidth(l);
  trace(ctx, corners);
  ctx.stroke();
  stack.forEach((cell, row) => drawCell(ctx, l, angle, row, cell));
}

function drawBurst(ctx: PaintCtx, l: Layout, sinceMs: number): void {
  const life = sinceMs / BURST_MS;
  if (life < 0 || life >= 1) return;
  const reach = (ringRadius(l, START_LIMIT_ROWS) + l.rowHeight) * (1 - (1 - life) ** 3);
  ctx.globalAlpha = life <= BURST_FADE_FROM ? 1 : (1 - life) / (1 - BURST_FADE_FROM);
  for (let i = 0; i < BURST_COUNT; i++) {
    const a = UP + i * BURST_STEP;
    const d = reach * (BURST_SPEEDS[i % BURST_SPEEDS.length] ?? 1);
    ctx.fillStyle = PALETTE[i % PALETTE.length] ?? RAINBOW_FILL;
    ctx.beginPath();
    ctx.arc(l.cx + Math.cos(a) * d, l.cy + Math.sin(a) * d, l.rowHeight / 3, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function limitLineWidth(l: Layout): number {
  return Math.max(1, l.rowHeight * 0.12);
}

export function paint(
  ctx: PaintCtx,
  state: RunState,
  l: Layout,
  nowMs: number,
  popups: readonly ShownPopup[] = [],
  ending?: PaintEnding,
): void {
  ctx.clearRect(0, 0, l.width, l.height);
  const turn = state.facing + rotationOffset(state, nowMs);
  // At the end everything below is drawn dimmed; the cleared canvas itself gets no wash.
  if (ending) ctx.globalAlpha = ENDING_DIM_ALPHA;

  ctx.fillStyle = CORE_FILL;
  trace(ctx, ring(l, 0, turn));
  ctx.fill();

  ctx.strokeStyle = state.boundaryWarned ? LIMIT_WARN_STROKE : LIMIT_STROKE;
  ctx.lineWidth = limitLineWidth(l);
  trace(ctx, ring(l, state.limitRows, turn));
  ctx.stroke();

  const windowMs = state.comboUntilMs - state.lastClearAtMs;
  if (state.lastClearAtMs >= 0 && nowMs < state.comboUntilMs && windowMs > 0) {
    const left = Math.min(1, (state.comboUntilMs - nowMs) / windowMs);
    ctx.strokeStyle = COMBO_STROKE;
    ctx.lineWidth = Math.max(1, l.rowHeight * 0.2);
    ctx.beginPath();
    ctx.arc(l.cx, l.cy, l.apothem * COMBO_RING_SCALE, UP, UP + 2 * Math.PI * left);
    ctx.stroke();
    if (state.combo > 1) {
      const px = Math.max(MIN_TEXT_PX, l.apothem * COMBO_TEXT_SCALE);
      outlinedText(ctx, `x${state.combo}`, l.cx, l.cy, px, COMBO_TEXT_FILL, 1);
    }
  }

  state.sides.forEach((stack, side) => {
    const angle = UP + (side + turn) * STEP;
    stack.forEach((cell, row) => drawCell(ctx, l, angle, row, cell));
  });

  for (const piece of state.falling) {
    drawCell(ctx, l, UP + piece.lane * STEP, piece.distance, piece);
  }

  for (const popup of popups) drawPopup(ctx, l, turn, popup, nowMs);

  if (!ending) return;
  ctx.globalAlpha = 1;
  drawOverflow(ctx, state, l, turn, ending);
  if (ending.newBest) drawBurst(ctx, l, ending.sinceMs);
}
