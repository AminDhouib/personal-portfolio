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

const STEERING_KEYS = ["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"];

// What the window keydown handler does with a (lower-cased) key before the
// game reads it: `ignore` means the key belongs to a text field and the
// handler returns; `preventDefault` claims the steering keys and Space while a
// run is live and on screen so the page does not scroll under the player.
// Space still activates a focused control (e.g. the Pause button).
export function orbitalKeyDecision(input: {
  key: string;
  textEntry: boolean;
  onControl: boolean;
  runLive: boolean;
  inView: boolean;
}): { ignore: boolean; preventDefault: boolean } {
  if (input.textEntry) return { ignore: true, preventDefault: false };
  const claimed = STEERING_KEYS.includes(input.key) || (input.key === " " && !input.onControl);
  return { ignore: false, preventDefault: input.runLive && input.inView && claimed };
}
