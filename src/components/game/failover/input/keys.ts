// The keyboard map. Pure: a KeyboardEvent.key in, a command out, or null for a
// key the game leaves to the page (Tab, Enter, scrolling keys).

export type KeyCommand =
  /** Screen-relative: dx is right, dz is down the screen. */
  | { kind: "pan"; dx: -1 | 0 | 1; dz: -1 | 0 | 1 }
  /** Quarter turns: -1 is Q, 1 is E. */
  | { kind: "orbit"; dir: -1 | 1 }
  | { kind: "zoom"; dir: -1 | 1 }
  | { kind: "pause" }
  /** Isometric or top-down. */
  | { kind: "view" }
  | { kind: "tool"; tool: "select" | "link" | "demolish" }
  | { kind: "cancel" };

const KEYS: Record<string, KeyCommand> = {
  w: { kind: "pan", dx: 0, dz: -1 },
  arrowup: { kind: "pan", dx: 0, dz: -1 },
  s: { kind: "pan", dx: 0, dz: 1 },
  arrowdown: { kind: "pan", dx: 0, dz: 1 },
  a: { kind: "pan", dx: -1, dz: 0 },
  arrowleft: { kind: "pan", dx: -1, dz: 0 },
  d: { kind: "pan", dx: 1, dz: 0 },
  arrowright: { kind: "pan", dx: 1, dz: 0 },
  q: { kind: "orbit", dir: -1 },
  e: { kind: "orbit", dir: 1 },
  " ": { kind: "pause" },
  "+": { kind: "zoom", dir: 1 },
  "=": { kind: "zoom", dir: 1 },
  "-": { kind: "zoom", dir: -1 },
  _: { kind: "zoom", dir: -1 },
  t: { kind: "view" },
  "1": { kind: "tool", tool: "select" },
  v: { kind: "tool", tool: "select" },
  "2": { kind: "tool", tool: "link" },
  l: { kind: "tool", tool: "link" },
  "3": { kind: "tool", tool: "demolish" },
  x: { kind: "tool", tool: "demolish" },
  delete: { kind: "tool", tool: "demolish" },
  escape: { kind: "cancel" },
};

export function keyCommand(key: string): KeyCommand | null {
  return KEYS[key.toLowerCase()] ?? null;
}
