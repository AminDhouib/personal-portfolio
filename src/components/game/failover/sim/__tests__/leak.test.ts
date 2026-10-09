// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { resetSim, S } from "../state";
import { BOARD_A, BOARD_B, BOARD_C, MID_RUN, play, type ScriptEntry } from "./scripted";

afterEach(() => resetSim({ seed: "after-leak" }));

// A module-level counter, cache or cursor that resetSim forgets shows up here as
// a run that plays differently the second time round, because some other board
// ran in between. 50 s of survival traffic is enough for every board to be busy.
const BOARDS: Record<string, ScriptEntry[]> = {
  A: [...BOARD_A, ...MID_RUN],
  B: [...BOARD_B, ...MID_RUN],
  C: [...BOARD_C, ...MID_RUN],
};
const SEEDS = ["leak-seed-1", "leak-seed-2", "leak-seed-3"];
const ORDER = ["A", "B", "C", "A", "C", "B"];
const TICKS = 1000;

describe("no state leaks between runs in one process", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: A, B, C, A, C, B each repeat equals its first run`, () => {
      const first = new Map<string, { hash: number; score: number; logLength: number }>();
      for (const name of ORDER) {
        const script = BOARDS[name];
        if (!script) throw new Error(`no board ${name}`);
        const run = play(seed, "survival", script, TICKS);
        const seen = { hash: run.hash, score: run.score, logLength: run.log.length };
        const before = first.get(name);
        if (before) expect(seen).toEqual(before);
        else first.set(name, seen);
      }
      // The boards are genuinely different runs, or the repeats prove nothing.
      const hashes = [...first.values()].map((r) => r.hash);
      expect(new Set(hashes).size).toBe(3);
    });
  }

  it("the traffic really flows on each board", () => {
    for (const name of ["A", "B", "C"]) {
      const script = BOARDS[name];
      if (!script) throw new Error(`no board ${name}`);
      play(SEEDS[0] ?? "", "survival", script, TICKS);
      expect(S.requestsProcessed).toBeGreaterThan(20);
    }
  });

  it("different seeds are different runs on the same board", () => {
    const hashes = SEEDS.map((seed) => play(seed, "survival", BOARDS.A ?? [], TICKS).hash);
    expect(new Set(hashes).size).toBe(3);
  });
});
