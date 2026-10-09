// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { replay } from "../replay";
import { resetSim } from "../state";
import { BOARD_S, MID_RUN_S, play } from "./scripted";

afterEach(() => resetSim({ seed: "after-golden" }));

const SEED = "failover-golden";
const TICKS = 6000; // 300 s
const SCRIPT = [...BOARD_S, ...MID_RUN_S];

// The golden run: one 300 s survival game, built and tuned through dispatch, on a
// fixed seed. The hash is what Chromium (in the e2e suite, T8-5) and Node must
// both reproduce, so a change here means the sim plays differently on purpose.
//
// How these were recorded: run this file with the pins set to 0, copy the two
// values from the failure output, then re-run. Re-record only after a deliberate
// sim change (the coordinator re-pins at the end of T8-1b once every mechanic has
// landed; a mechanic added to the sim shifts both numbers). First recorded while
// the T8-1b mechanics were still arriving, so expect this pin to move once.
// Re-recorded in T8-1b A2 for the same stateHash additions (was 1246757318; the score did not move).
const GOLDEN_HASH = 464767114;
const GOLDEN_SCORE = 26175;

describe("golden run", () => {
  it("plays the way it was recorded", () => {
    const run = play(SEED, "survival", SCRIPT, TICKS);
    expect({ hash: run.hash, score: run.score }).toEqual({
      hash: GOLDEN_HASH,
      score: GOLDEN_SCORE,
    });
  });

  it("replays to the same pinned values from its log alone", () => {
    const run = play(SEED, "survival", SCRIPT, TICKS);
    const result = replay({ seed: SEED, mode: "survival", log: run.log, ticks: TICKS });
    expect({ hash: result.hash, score: result.score }).toEqual({
      hash: GOLDEN_HASH,
      score: GOLDEN_SCORE,
    });
    expect(result.endReason).toBe("time");
  });
});
