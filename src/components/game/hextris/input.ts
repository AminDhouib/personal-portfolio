import type { Phase } from "./engine/types";

// The engine phase the router reads; the countdown routes like play (spec section 3.7).
export type HexRunPhase = Phase;

export type HexKeyAction =
  "start" | "restart" | "rotate-cw" | "rotate-ccw" | "rush" | "toggle-pause" | "panic" | "none";

const START_KEYS = new Set([" ", "Enter", "ArrowLeft", "ArrowRight", "ArrowDown", "a", "d", "s"]);
const RESTART_KEYS = new Set([" ", "Enter", "r"]);

// Decides what one keydown does. `textEntry` (a field the player is typing
// in), `modifier` (a Ctrl/Meta/Alt chord) and `onControl` (Space or Enter on
// a focused button or link) all leave the key to the browser. `preventDefault`
// is set for every key the game claims, so Space and the arrows do not scroll
// the page. On game over Space, Enter and R restart once `canRestart` says the
// lockout has passed (game-over.ts); during it they are held but do nothing.
// Left rotates counter-clockwise.
export function hextrisKeyAction(input: {
  key: string;
  phase: HexRunPhase;
  textEntry: boolean;
  onControl: boolean;
  modifier: boolean;
  repeat: boolean;
  /** Game over only: the restart lockout has passed. */
  canRestart?: boolean;
}): { action: HexKeyAction; preventDefault: boolean } {
  const none = { action: "none", preventDefault: false } as const;
  if (input.textEntry || input.modifier || input.onControl) return none;
  const key = input.key;
  if (input.phase === "over") {
    if (!RESTART_KEYS.has(key.length === 1 ? key.toLowerCase() : key)) return none;
    const restart = input.canRestart === true && !input.repeat;
    return { action: restart ? "restart" : "none", preventDefault: true };
  }
  if (input.phase === "ready") {
    if (!START_KEYS.has(key.length === 1 ? key.toLowerCase() : key)) return none;
    return { action: input.repeat ? "none" : "start", preventDefault: true };
  }
  const lower = key.length === 1 ? key.toLowerCase() : key;
  let action: HexKeyAction;
  if (lower === "ArrowLeft" || lower === "a") action = "rotate-ccw";
  else if (lower === "ArrowRight" || lower === "d") action = "rotate-cw";
  else if (lower === "ArrowDown" || lower === "s") action = "rush";
  else if (lower === " " || lower === "p") action = "toggle-pause";
  else if (lower === "f") action = "panic";
  else return none;
  // A held Space must not start the run and then flip pause on every repeat;
  // rotation and rush keep repeating.
  if (input.repeat && action === "toggle-pause") {
    return { action: "none", preventDefault: true };
  }
  // Pause swallows the steering and panic keys but only Space and P act.
  if (input.phase === "paused" && action !== "toggle-pause") {
    return { action: "none", preventDefault: true };
  }
  return { action, preventDefault: true };
}
