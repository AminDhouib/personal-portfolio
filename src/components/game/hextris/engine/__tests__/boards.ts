// Hand-built boards for the engine tests. Each side is a string read from row 0 outward:
// a, b, c, d are colours 0..3, the same letter in upper case is a bomb of that colour, and
// * is a rainbow.

import { COUNTDOWN_MS, createRun, drainEvents } from "../state";
import { advance, start } from "../step";
import type { Cell, Colour, RunState } from "../types";

const LETTERS = "abcd";

function cellOf(ch: string): Cell {
  if (ch === "*") return { colour: 0, special: "rainbow" };
  const colour = LETTERS.indexOf(ch.toLowerCase());
  if (colour < 0) throw new Error(`unknown cell letter ${ch}`);
  return { colour: colour as Colour, special: ch === ch.toUpperCase() ? "bomb" : "none" };
}

export function boardState(sides: Partial<Record<number, string>>, seed = 1): RunState {
  const s = createRun({ seed });
  s.phase = "playing";
  for (let side = 0; side < 6; side++) {
    s.sides[side] = [...(sides[side] ?? "")].map(cellOf);
  }
  return s;
}

/** A started run taken through its countdown: the clock at 0, play just begun, no events. */
export function startedRun(seed: number): RunState {
  const s = createRun({ seed });
  start(s);
  advance(s, COUNTDOWN_MS);
  drainEvents(s);
  return s;
}

/** The board back as strings, in the same notation. */
export function sidesOf(s: RunState): string[] {
  return s.sides.map((stack) =>
    stack
      .map((c) => {
        if (c.special === "rainbow") return "*";
        const letter = LETTERS[c.colour] ?? "?";
        return c.special === "bomb" ? letter.toUpperCase() : letter;
      })
      .join(""),
  );
}
