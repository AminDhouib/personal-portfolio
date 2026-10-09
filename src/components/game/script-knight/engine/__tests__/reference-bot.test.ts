// @vitest-environment node
import { describe, expect, it } from "vitest";

import { encodeLog } from "../codec";
import { createReferenceBot, playWithBot } from "../reference-bot";
import { configForRef } from "../run";
import { replayOk } from "./helpers";

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
    const replay = replayOk(config, played.actions);
    expect(replay.consumed).toBe(played.actions.length);
    expect(replay.result).toEqual(played.result);
  });

  it("is deterministic and keeps nothing between runs", () => {
    const a = playWithBot(floor("narrow-path", 6, true));
    const b = playWithBot(floor("narrow-path", 6, true));
    expect(encodeLog(a.actions)).toBe(encodeLog(b.actions));
  });

  it("only calls abilities the floor grants, so a thin floor loses without crashing", () => {
    // Floor 5 as unlocked has no look or shoot: the bot cannot win it, but it must neither throw
    // nor reach for an ability it was not given (which the step API would refuse).
    const outcome = playWithBot(floor("narrow-path", 5, false));
    expect(outcome.status).toBe("failed");
    expect(outcome.result).toMatchObject({ passed: false, turns: 15, score: null });
    expect(encodeLog(outcome.actions)).toBe("1:w0s0w0a0a0w0a0a0r-r-w0a0a0a0a0");
  });

  it("keeps its health memory per bot, so a fresh bot does not inherit a history", () => {
    // Health 20 then 10 means the bot is under fire and keeps moving; a bot that sees 10 for the
    // first time is not under fire and rests. Sharing one bot between runs would blur the two.
    const noUnit = {
      isUnit: () => false,
      isWall: () => false,
      isStairs: () => false,
      getUnit: () => null,
    };
    function turnAt(health: number, calls: string[]) {
      return {
        health: () => health,
        maxHealth: () => 20,
        feel: () => noUnit,
        rest: () => void calls.push("rest"),
        walk: () => void calls.push("walk"),
      };
    }
    const seasoned: string[] = [];
    const veteran = createReferenceBot();
    veteran(turnAt(20, seasoned));
    veteran(turnAt(10, seasoned));
    const fresh: string[] = [];
    createReferenceBot()(turnAt(10, fresh));
    expect(seasoned.at(-1)).toBe("walk");
    expect(fresh).toEqual(["rest"]);
  });
});
