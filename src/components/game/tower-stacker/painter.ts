// Tower Stacker's canvas painter. PURE with respect to the page: it draws through a
// structural CanvasLike and never reads window or document (painter.test.ts runs in
// the node environment). World y grows upward; the camera's y is the world height at
// the bottom edge of the view.
import type { Camera } from "./camera";
import type { DebrisPiece } from "./debris";
import {
  BLOCK_HEIGHT,
  FALL_MS,
  HANG_GAP,
  craneOffset,
  swingFor,
  topSlab,
  type Slab,
  type TowerRun,
} from "./engine";
import type { StageLayout } from "./layout";
import { GRID_PX, PALETTE } from "./palette";

export interface CanvasLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  globalAlpha: number;
  textAlign: string;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
}

export interface Scene {
  run: TowerRun;
  camera: Camera;
  debris: DebrisPiece[];
  /** The clock the crane is read at: the frame time, or the pause instant. */
  now: number;
  layout: StageLayout;
  dpr: number;
  /** Start times of the perfect rings. */
  pulses: number[];
  /** When the newest slab was released, for its fall animation; null for none. */
  landedAt: number | null;
  /** Screen shake offset in css pixels. */
  shake: { x: number; y: number };
}

export const PULSE_MS = 400;
/** Distance from the bottom of the stage to world height 0, in css pixels. */
const GROUND_PX = 48;
/** The jib sits this far below the top of the stage, in css pixels. */
const JIB_Y = 26;

/** The tone a landed slab was dealt: the same seeded draw as its swing. */
function slabTone(seed: number, index: number): number {
  return swingFor(seed, index, 0, 0).tone;
}

/** Diagonal hatch segments clipped to the rect, one every `step` pixels. */
function hatchSegments(
  x: number,
  y: number,
  w: number,
  h: number,
  step: number,
): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  // Lines of slope -1 through the rect: x + y = c.
  for (let c = x + y + step; c < x + y + w + h; c += step) {
    const x0 = Math.max(x, c - (y + h));
    const x1 = Math.min(x + w, c - y);
    if (x1 > x0) out.push([x0, c - x0, x1, c - x1]);
  }
  return out;
}

export function paintFrame(ctx: CanvasLike, scene: Scene): void {
  const { run, camera, layout, dpr, now } = scene;
  const { cssWidth, cssHeight, scale } = layout;
  const toX = (wx: number) => (wx - camera.x) * scale + cssWidth / 2;
  const toY = (wy: number) => cssHeight - GROUND_PX - (wy - camera.y) * scale;
  const unit = BLOCK_HEIGHT * scale;

  ctx.setTransform(dpr, 0, 0, dpr, scene.shake.x * dpr, scene.shake.y * dpr);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.field;
  ctx.fillRect(-8, -8, cssWidth + 16, cssHeight + 16);

  // Grid.
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 0; gx <= cssWidth; gx += GRID_PX) {
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, cssHeight);
  }
  for (let gy = 0; gy <= cssHeight; gy += GRID_PX) {
    ctx.moveTo(0, gy);
    ctx.lineTo(cssWidth, gy);
  }
  ctx.stroke();

  // Slabs: only those inside the camera window, plus one either side.
  const viewWorldHeight = (cssHeight - GROUND_PX) / scale;
  const first = Math.max(0, Math.floor(camera.y / BLOCK_HEIGHT) - 1);
  const last = Math.min(
    run.slabs.length - 1,
    Math.ceil((camera.y + viewWorldHeight + GROUND_PX / scale) / BLOCK_HEIGHT),
  );
  const newest = run.slabs.length - 1;
  const fallT =
    scene.landedAt === null ? 1 : Math.min(1, Math.max(0, (now - scene.landedAt) / FALL_MS));
  ctx.lineWidth = 1;
  for (let i = first; i <= last; i++) {
    const slab = run.slabs[i];
    if (!slab) continue;
    const lift = i === newest && i > 0 ? (1 - fallT * fallT) * HANG_GAP * BLOCK_HEIGHT : 0;
    const sx = toX(slab.left);
    const sy = toY((i + 1) * BLOCK_HEIGHT + lift);
    const sw = slab.width * scale;
    ctx.fillStyle =
      i === 0 ? PALETTE.tones[0] : (PALETTE.tones[slabTone(run.seed, i)] ?? PALETTE.field);
    ctx.fillRect(sx, sy, sw, unit);
    ctx.strokeStyle = PALETTE.hatch;
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of hatchSegments(sx, sy, sw, unit, 9)) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
    ctx.strokeStyle = PALETTE.slabStroke;
    ctx.strokeRect(sx, sy, sw, unit);
  }

  // Offcuts.
  for (const p of scene.debris) {
    const cx = toX(p.left + p.width / 2);
    const cy = toY(p.y + BLOCK_HEIGHT / 2);
    const cos = Math.cos(p.angle);
    const sin = Math.sin(p.angle);
    ctx.save();
    ctx.setTransform(
      cos * dpr,
      sin * dpr,
      -sin * dpr,
      cos * dpr,
      (cx + scene.shake.x) * dpr,
      (cy + scene.shake.y) * dpr,
    );
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = PALETTE.tones[2];
    ctx.fillRect((-p.width * scale) / 2, -unit / 2, p.width * scale, unit);
    ctx.strokeStyle = PALETTE.slabStroke;
    ctx.strokeRect((-p.width * scale) / 2, -unit / 2, p.width * scale, unit);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // Crane: jib, trolley, cable and the hanging block.
  const top = topSlab(run);
  ctx.strokeStyle = PALETTE.crane;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, JIB_Y);
  ctx.lineTo(cssWidth, JIB_Y);
  ctx.stroke();
  const swing = run.swing;
  if (swing && now >= swing.spawnAt) {
    const bx = toX(top.left + Math.round(craneOffset(swing, now)));
    const bw = top.width * scale;
    const by = toY((run.slabs.length + HANG_GAP) * BLOCK_HEIGHT);
    ctx.strokeStyle = PALETTE.crane;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + bw / 2, JIB_Y);
    ctx.lineTo(bx + bw / 2, by);
    ctx.stroke();
    ctx.fillStyle = PALETTE.crane;
    ctx.fillRect(bx + bw / 2 - 6, JIB_Y - 5, 12, 10);
    ctx.fillStyle = PALETTE.tones[swing.tone] ?? PALETTE.field;
    ctx.fillRect(bx, by, bw, unit);
    ctx.strokeStyle = PALETTE.accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bw, unit);
    // Dimension callout: the width the block would keep at full overlap.
    ctx.fillStyle = PALETTE.accent;
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "left";
    const label = `${top.width}`;
    const tw = ctx.measureText(label).width;
    const lx = bx + bw + 6 + tw > cssWidth ? bx - 6 - tw : bx + bw + 6;
    ctx.fillText(label, lx, by + unit / 2 + 4);
  }

  // Perfect rings: an outline growing off the newest slab for PULSE_MS.
  for (const at of scene.pulses) {
    const t = (now - at) / PULSE_MS;
    if (t < 0 || t >= 1 || newest < 1) continue;
    const slab: Slab | undefined = run.slabs[newest];
    if (!slab) continue;
    const grow = 4 + 18 * t;
    const x = toX(slab.left) - grow;
    const y = toY(newest * BLOCK_HEIGHT + BLOCK_HEIGHT) - grow;
    const w = slab.width * scale + grow * 2;
    const h = unit + grow * 2;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = PALETTE.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
