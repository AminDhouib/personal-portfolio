import type { GameStatus } from "./types";

const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, label, [role="button"], [data-allow-touch]';

// Per-frame keyboard step at 60 Hz, and the longest frame delta it scales by.
const KEYBOARD_STEP_60HZ = 0.14;
const MAX_FRAME_SECONDS = 0.05;

// A touch is the ship's steering input only while a run is live; the paused,
// armed and dead screens need the native tap so PLAY, SHOP, Resume and FLY
// AGAIN receive their synthesized click.
export function shouldCaptureTouch(target: EventTarget | null, status: GameStatus): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(INTERACTIVE_SELECTOR)) return false;
  return status === "playing";
}

// Keyboard steering distance for one frame, independent of refresh rate.
export function keyboardStep(dtSeconds: number): number {
  return KEYBOARD_STEP_60HZ * Math.max(0, Math.min(dtSeconds, MAX_FRAME_SECONDS)) * 60;
}
