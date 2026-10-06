import type { GameStatus } from "./types";

const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, label, [role="button"], [data-allow-touch]';

// Per-frame keyboard step at 60 Hz, and the longest frame delta it scales by.
const KEYBOARD_STEP_60HZ = 0.14;
const MAX_FRAME_SECONDS = 0.05;

// A touch is the ship's steering input only while a run is live; the paused,
// armed and dead screens need the native tap so PLAY, SHOP, Resume and FLY
// AGAIN receive their synthesized click. A touchstart on a control is left
// alone for the same reason, but once a drag is moving it steers wherever it
// began (a touchmove's target is its touchstart's), so a drag that starts on
// the Pause button does not scroll the page.
export function shouldCaptureTouch(
  target: EventTarget | null,
  status: GameStatus,
  phase: "start" | "move" = "start",
): boolean {
  if (status !== "playing") return false;
  if (phase === "move") return true;
  if (!(target instanceof Element)) return false;
  return target.closest(INTERACTIVE_SELECTOR) === null;
}

// Keyboard steering distance for one frame, independent of refresh rate.
export function keyboardStep(dtSeconds: number): number {
  return KEYBOARD_STEP_60HZ * Math.max(0, Math.min(dtSeconds, MAX_FRAME_SECONDS)) * 60;
}
