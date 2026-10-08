import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/components/game/password-game-2/engine/rng";
import { validateArcadeSubmission } from "@/lib/arcade/games";
import { findGroup } from "../match";
import { createRun, drainEvents, wrapSide } from "../state";
import { advance, start } from "../step";
import type { RunState, TimedAction } from "../types";

// Seeded headless runs of the new engine must always pass the arcade board's Hextris check
// (src/lib/arcade/games.ts), whatever the player does. Two bots play each seed to game over.

const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919);
const STEP_MS = 250;
// A ceiling on simulated play so a bot that never dies cannot hang the suite.
const MAX_STEPS = (40 * 60 * 1000) / STEP_MS;

type Bot = (s: RunState) => TimedAction[];

function rotations(steps: number): TimedAction[] {
  const action = steps > 0 ? "rotate-cw" : "rotate-ccw";
  return Array.from({ length: Math.abs(steps) }, () => ({ atMs: 0, action }));
}

function randomRotator(seed: number): Bot {
  const rng = mulberry32(seed ^ 0x5eed);
  return () => rotations(Math.floor(rng() * 3) - 1);
}

/** Turns the side that would make the largest group toward the lowest falling piece. */
const greedy: Bot = (s) => {
  const piece = [...s.falling].sort((a, b) => a.distance - b.distance)[0];
  if (!piece) return [];
  let best = { score: -Infinity, steps: 0 };
  for (let steps = -2; steps <= 3; steps++) {
    const side = wrapSide(piece.lane - (s.facing + steps));
    const sides = s.sides.map((stack) => [...stack]);
    const stack = sides[side] ?? [];
    stack.push({ colour: piece.colour, special: piece.special });
    const group = findGroup(sides, side, stack.length - 1).cells.length;
    // Prefer completing a group, then a bigger partial group, then a lower stack.
    const score = (group >= 3 ? 100 : 0) + group * 10 - stack.length - Math.abs(steps) * 0.1;
    if (score > best.score) best = { score, steps };
  }
  return rotations(best.steps);
};

function play(seed: number, bot: Bot): RunState {
  const s = createRun({ seed });
  start(s);
  for (let i = 0; i < MAX_STEPS && s.phase === "playing"; i++) {
    advance(s, STEP_MS, bot(s));
    drainEvents(s);
  }
  return s;
}

function verdict(s: RunState) {
  const detail = {
    seconds: Math.floor(s.elapsedMs / 1000),
    kills: s.cellsCleared,
    level: Math.floor(s.level),
  };
  return { detail, score: s.score, verdict: validateArcadeSubmission("hextris", s.score, detail) };
}

describe("seeded runs stay plausible for the arcade board", () => {
  it("passes the Hextris check for a random rotator on 40 seeds", () => {
    for (const seed of SEEDS) {
      const s = play(seed, randomRotator(seed));
      expect(s.phase, `seed ${seed} did not end`).toBe("over");
      const v = verdict(s);
      expect(v.verdict, `seed ${seed}: ${JSON.stringify(v)}`).toMatchObject({ ok: true });
    }
  });

  it("passes the Hextris check for a greedy bot on 40 seeds", () => {
    let scored = 0;
    for (const seed of SEEDS) {
      const s = play(seed, greedy);
      expect(s.phase, `seed ${seed} did not end`).toBe("over");
      const v = verdict(s);
      expect(v.verdict, `seed ${seed}: ${JSON.stringify(v)}`).toMatchObject({ ok: true });
      if (s.score > 0) scored++;
    }
    // The greedy bot really plays: most seeds clear something.
    expect(scored).toBeGreaterThan(SEEDS.length / 2);
  });

  it("passes the check straight after a forced Panic Clear and again at game over", () => {
    // Panic is the biggest single burst of points, so test it where it hurts most: early, on a
    // crowded board, submitted at once. Momentum is forced to 100 because bots rarely fill it.
    const bots: [string, (seed: number) => Bot][] = [
      ["random", (seed) => randomRotator(seed)],
      ["greedy", () => greedy],
    ];
    const panics: Record<string, number> = {};
    for (const [name, makeBot] of bots) {
      panics[name] = 0;
      for (const seed of SEEDS.slice(0, 10)) {
        const s = createRun({ seed });
        start(s);
        const bot = makeBot(seed);
        let panicked = false;
        for (let i = 0; i < MAX_STEPS && s.phase === "playing"; i++) {
          const settled = s.sides.reduce((sum, stack) => sum + stack.length, 0);
          const actions = bot(s);
          // Momentum only comes from group clears, and a clear removes at least 3 cells, so a
          // real run can only reach a full meter once cellsCleared >= 3. Forcing it earlier
          // would build a state play cannot reach.
          if (!panicked && settled >= 12 && s.cellsCleared >= 3) {
            s.momentum = 100;
            actions.push({ atMs: 0, action: "panic" });
          }
          advance(s, STEP_MS, actions);
          const burst = drainEvents(s).find((e) => e.type === "panic");
          if (burst?.type === "panic") {
            panicked = true;
            panics[name] = (panics[name] ?? 0) + 1;
            expect(burst.cells).toBeGreaterThanOrEqual(12);
            const now = verdict(s);
            expect(
              now.verdict,
              `${name} ${seed} after panic: ${JSON.stringify(now)}`,
            ).toMatchObject({ ok: true });
          }
        }
        expect(s.phase).toBe("over");
        const end = verdict(s);
        expect(end.verdict, `${name} ${seed}: ${JSON.stringify(end)}`).toMatchObject({ ok: true });
      }
    }
    // Pinned per seed set, so a change that stops panics firing fails here instead of passing on
    // no cases. Some random-rotator seeds die before any clear and never qualify.
    expect(panics).toEqual({ random: 6, greedy: 10 });
  });

  it("only ever has momentum once a group of at least 3 has cleared", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      for (const bot of [randomRotator(seed), greedy]) {
        const s = createRun({ seed });
        start(s);
        for (let i = 0; i < MAX_STEPS && s.phase === "playing"; i++) {
          advance(s, STEP_MS, bot(s));
          drainEvents(s);
          if (s.momentum > 0)
            expect(s.cellsCleared, `seed ${seed} step ${i}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it.todo("scores 0 for an idle bot (enabled by T5-4)");
});
