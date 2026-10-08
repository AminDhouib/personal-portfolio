import type { EngineEvent } from "../engine/types";

// Pure feel helpers for the shell and the painter: screen shake, hit-stop, score popups and the
// colour contrast check for on-board text. Nothing here reads or writes run state.

export { hitStopMs } from "../engine/scoring";

/** Peak screen-shake offset, in CSS pixels, and how long a shake lasts. */
export const SHAKE_MAX_PX = 8;
export const SHAKE_MS = 180;

/**
 * Screen shake for a clear, as a peak offset in CSS pixels: none below 3 cells, then growing with
 * the size of the clear, half as much again for a chain, and never more than SHAKE_MAX_PX.
 */
export function shakeFor(cells: number, chain: boolean): number {
  if (cells < 3) return 0;
  const base = 1.5 + (cells - 3) * 1.25;
  return Math.min(SHAKE_MAX_PX, chain ? base * 1.5 : base);
}

/** On-board text: a light fill inside a dark outline, so it reads over any cell or background. */
export const TEXT_OUTLINE_RGB = "#000000";
export const TEXT_OUTLINE_ALPHA = 0.85;
export const TEXT_OUTLINE_STYLE = `rgba(0, 0, 0, ${TEXT_OUTLINE_ALPHA})`;
export const TEXT_OUTLINE_PX = 3;
export const COMBO_TEXT_FILL = "#ffffff";
/** "+N" fills by combo level: 1, 2-3, 4-5, then 6 and up. */
export const POPUP_FILLS: readonly string[] = ["#ffffff", "#ffe680", "#ffc46b", "#ff9f8a"];

/** How long a popup shows, and the largest size a combo can grow it to. */
export const POPUP_MS = 800;
const POPUP_MAX_SCALE = 2;
const POPUP_SCALE_PER_COMBO = 0.2;

/** A score popup, anchored to a board cell (it turns with the board). */
export interface Popup {
  text: string;
  /** Size relative to a combo-1 popup. */
  scale: number;
  fill: string;
  side: number;
  row: number;
}

/** A popup the shell is showing, with the run time (`nowMs`) it appeared at. */
export interface ShownPopup extends Popup {
  bornMs: number;
}

function popupFill(combo: number): string {
  const tier = combo >= 6 ? 3 : combo >= 4 ? 2 : combo >= 2 ? 1 : 0;
  return POPUP_FILLS[tier] ?? COMBO_TEXT_FILL;
}

/**
 * The "+N" popup for a scoring event, or null. A clear's popup sits on its first cell (the piece
 * that landed) and grows with the combo; a clean sweep's sits a row above it at full size. A clear
 * that scored nothing (the player was away) gets none.
 */
export function popupFor(event: EngineEvent): Popup | null {
  if (event.type !== "clear" && event.type !== "clean-sweep") return null;
  const anchor = event.cells[0];
  if (event.points <= 0 || !anchor) return null;
  const sweep = event.type === "clean-sweep";
  return {
    text: `+${event.points}`,
    scale: sweep
      ? POPUP_MAX_SCALE
      : Math.min(POPUP_MAX_SCALE, 1 + POPUP_SCALE_PER_COMBO * (event.combo - 1)),
    fill: popupFill(event.combo),
    side: anchor.side,
    row: anchor.row + (sweep ? 1 : 0),
  };
}

function channels(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`expected a #rrggbb colour, got ${hex}`);
  return [m[1], m[2], m[3]].map((h) => parseInt(h ?? "0", 16)) as [number, number, number];
}

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

/** `top` drawn at `alpha` over `bottom`, blended per channel as a canvas does (sRGB). */
export function composite(top: string, alpha: number, bottom: string): string {
  const t = channels(top);
  const b = channels(bottom);
  return toHex(t.map((c, i) => c * alpha + (b[i] ?? 0) * (1 - alpha)));
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two #rrggbb colours, from 1 to 21. */
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
