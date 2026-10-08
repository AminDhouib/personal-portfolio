export type HexRunPhase = "ready" | "playing" | "paused" | "over";

export type HexKeyAction =
  "start" | "rotate-cw" | "rotate-ccw" | "rush" | "toggle-pause" | "panic" | "none";

const START_KEYS = new Set([" ", "Enter", "ArrowLeft", "ArrowRight", "ArrowDown", "a", "d", "s"]);

// Decides what one keydown does. `textEntry` (a field the player is typing
// in), `modifier` (a Ctrl/Meta/Alt chord) and `onControl` (Space or Enter on
// a focused button or link) all leave the key to the browser. `preventDefault`
// is set for every key the game claims, so Space and the arrows do not scroll
// the page; on game over nothing is claimed, since the player must press
// "Play again" deliberately. Left rotates counter-clockwise (`hexRotate(1)`).
export function hextrisKeyAction(input: {
  key: string;
  phase: HexRunPhase;
  textEntry: boolean;
  onControl: boolean;
  modifier: boolean;
}): { action: HexKeyAction; preventDefault: boolean } {
  const none = { action: "none", preventDefault: false } as const;
  if (input.textEntry || input.modifier || input.onControl || input.phase === "over") return none;
  const key = input.key;
  if (input.phase === "ready") {
    return START_KEYS.has(key.length === 1 ? key.toLowerCase() : key)
      ? { action: "start", preventDefault: true }
      : none;
  }
  const lower = key.length === 1 ? key.toLowerCase() : key;
  let action: HexKeyAction;
  if (lower === "ArrowLeft" || lower === "a") action = "rotate-ccw";
  else if (lower === "ArrowRight" || lower === "d") action = "rotate-cw";
  else if (lower === "ArrowDown" || lower === "s") action = "rush";
  else if (lower === " " || lower === "p") action = "toggle-pause";
  else if (lower === "f") action = "panic";
  else return none;
  // Pause swallows the steering and panic keys but only Space and P act.
  if (input.phase === "paused" && action !== "toggle-pause") {
    return { action: "none", preventDefault: true };
  }
  return { action, preventDefault: true };
}
