import { CONFIG } from "../sim/config";

// Camera state and the arithmetic on it. Pure: the scene turns a pose into an
// OrthographicCamera, nothing here touches three. Isometric by default, with a
// top-down toggle; Q/E (or the Orbit button) turn the board a quarter at a
// time, with no free rotation. Pan and zoom are clamped to the board.

export interface CameraState {
  /** The ground point at the centre of the view. */
  x: number;
  z: number;
  zoom: number;
  /** Quarter turns from the default heading, 0 to 3. */
  quarter: 0 | 1 | 2 | 3;
  topDown: boolean;
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  /** Half the visible height in world units at this zoom. */
  halfHeight: number;
}

/** World units visible top to bottom at zoom 1. */
const VIEW_HEIGHT = 80;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;
const DISTANCE = 120;
/** The true isometric elevation, atan(1 / sqrt 2). */
const ISO_ELEVATION = Math.atan(1 / Math.SQRT2);
const BOARD_LIMIT = (CONFIG.gridSize * CONFIG.tileSize) / 2;
/** One keyboard pan step, in world units at zoom 1. */
const KEY_PAN_STEP = 6;

export function initialCamera(): CameraState {
  // Between the Internet node (x = -40) and the middle of the board.
  return { x: -16, z: 0, zoom: 1, quarter: 0, topDown: false };
}

function azimuth(s: CameraState): number {
  return Math.PI / 4 + (s.quarter * Math.PI) / 2;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Screen right and screen up, as unit vectors on the ground. */
function groundAxes(s: CameraState): { right: [number, number]; up: [number, number] } {
  const a = azimuth(s);
  return { right: [Math.cos(a), -Math.sin(a)], up: [-Math.sin(a), -Math.cos(a)] };
}

function moveBy(s: CameraState, alongRight: number, alongUp: number): CameraState {
  const { right, up } = groundAxes(s);
  return {
    ...s,
    x: clamp(s.x + right[0] * alongRight + up[0] * alongUp, -BOARD_LIMIT, BOARD_LIMIT),
    z: clamp(s.z + right[1] * alongRight + up[1] * alongUp, -BOARD_LIMIT, BOARD_LIMIT),
  };
}

/** A keyboard pan: dx right, dz down the screen, one step each, smaller when zoomed in. */
export function panByKey(s: CameraState, dx: number, dz: number): CameraState {
  const step = KEY_PAN_STEP / s.zoom;
  return moveBy(s, dx * step, -dz * step);
}

/**
 * A drag: the pointer moved (dxPx, dyPx) on a view `viewportHeightPx` tall, and
 * the board follows it. In the isometric view a vertical pixel covers more
 * ground than a horizontal one, by 1 / sin(elevation).
 */
export function panByPixels(
  s: CameraState,
  dxPx: number,
  dyPx: number,
  viewportHeightPx: number,
): CameraState {
  if (viewportHeightPx <= 0) return s;
  const unitsPerPx = VIEW_HEIGHT / s.zoom / viewportHeightPx;
  const vertical = s.topDown ? 1 : 1 / Math.sin(ISO_ELEVATION);
  return moveBy(s, -dxPx * unitsPerPx, dyPx * unitsPerPx * vertical);
}

export function zoomBy(s: CameraState, factor: number): CameraState {
  if (!(factor > 0)) return s;
  return { ...s, zoom: clamp(s.zoom * factor, MIN_ZOOM, MAX_ZOOM) };
}

export function orbit(s: CameraState, dir: -1 | 1): CameraState {
  return { ...s, quarter: ((((s.quarter + dir) % 4) + 4) % 4) as CameraState["quarter"] };
}

export function toggleView(s: CameraState): CameraState {
  return { ...s, topDown: !s.topDown };
}

export function cameraPose(s: CameraState): CameraPose {
  const a = azimuth(s);
  const target: [number, number, number] = [s.x, 0, s.z];
  const halfHeight = VIEW_HEIGHT / 2 / s.zoom;
  if (s.topDown) {
    // Straight down; screen up is the heading's forward, so Q/E still turn the board.
    return {
      position: [s.x, DISTANCE, s.z],
      target,
      up: [-Math.sin(a), 0, -Math.cos(a)],
      halfHeight,
    };
  }
  const flat = Math.cos(ISO_ELEVATION) * DISTANCE;
  return {
    position: [
      s.x + Math.sin(a) * flat,
      Math.sin(ISO_ELEVATION) * DISTANCE,
      s.z + Math.cos(a) * flat,
    ],
    target,
    up: [0, 1, 0],
    halfHeight,
  };
}
