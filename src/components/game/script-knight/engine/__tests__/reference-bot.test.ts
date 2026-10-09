// @vitest-environment node
import { describe, expect, it } from "vitest";

import { encodeLog } from "../codec";
import { createReferenceBot, playWithBot } from "../reference-bot";
import { configForRef, replayLog } from "../run";

function floor(tower: "narrow-path" | "powder-keep", level: number, epic: boolean) {
  return configForRef({ kind: "tower", tower, level, epic }, "Bot");
}

// Pinned results: [level, turns, score total]. Changing the bot changes these on purpose.
const NORMAL: Array<[number, number, number]> = [
  [1, 7, 10],
  [2, 10, 26],
  [3, 28, 66],
  [4, 31, 83],
  [7, 28, 40],
  [8, 8, 46],
  [9, 33, 97],
];
const EPIC: Array<[number, number, number]> = [
  [1, 7, 10],
  [2, 11, 25],
  [3, 24, 71],
  [4, 25, 90],
  [5, 24, 119],
  [6, 28, 102],
  [7, 17, 53],
  [8, 8, 46],
  [9, 33, 97],
];

describe("the reference bot on the Narrow Path", () => {
  it.each(NORMAL)(
    "passes floor %i as the tower unlocks it (%i turns, %i points)",
    (level, turns, total) => {
      const { status, result } = playWithBot(floor("narrow-path", level, false));
      expect(status).toBe("passed");
      expect(result.turns).toBe(turns);
      expect(result.score?.total).toBe(total);
    },
  );

  it.each(EPIC)("passes floor %i in epic mode (%i turns, %i points)", (level, turns, total) => {
    const { status, result } = playWithBot(floor("narrow-path", level, true));
    expect(status).toBe("passed");
    expect(result.turns).toBe(turns);
    expect(result.score?.total).toBe(total);
  });

  it("clears the whole epic set, which is what the daily generator relies on", () => {
    const outcomes = EPIC.map(([level]) => playWithBot(floor("narrow-path", level, true)).status);
    expect(outcomes.every((status) => status === "passed")).toBe(true);
  });

  it("pins its action log on one floor so edits to the bot are deliberate", () => {
    const { actions } = playWithBot(floor("narrow-path", 3, true));
    expect(encodeLog(actions)).toBe("1:h0h0h0h0w0h0h0h0h0w0h0h0h0h0w0w0h0h0h0h0w0w0w0w0");
  });

  it("replays through the log to the same result it played", () => {
    const config = floor("narrow-path", 9, true);
    const played = playWithBot(config);
    const replay = replayLog(config, played.actions);
    expect(replay.consumed).toBe(played.actions.length);
    expect(replay.result).toEqual(played.result);
  });

  it("is deterministic and keeps nothing between runs", () => {
    const a = playWithBot(floor("narrow-path", 6, true));
    const b = playWithBot(floor("narrow-path", 6, true));
    expect(encodeLog(a.actions)).toBe(encodeLog(b.actions));
  });

  it("only calls abilities the floor grants, so a thin floor does not throw", () => {
    // Floor 5 as unlocked has no look or shoot: the bot loses, but it must not crash or cheat.
    const outcome = playWithBot(floor("narrow-path", 5, false));
    expect(["passed", "failed", "out-of-turns"]).toContain(outcome.status);
    expect(outcome.actions.length).toBeGreaterThan(0);
  });

  it("is one function per run: a bot remembers its health, so each run gets a fresh one", () => {
    expect(createReferenceBot()).not.toBe(createReferenceBot());
  });
});
