import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CUES, cueFor, endCue } from "../sound-cues";
import { startDailyRun, startFloorRun, type Runner } from "../run-floor";
import type { RunOutcome } from "../sandbox/run-client";
import { usePlayback } from "../use-playback";
import { towerFrames } from "./frames";

const ref = { kind: "tower", tower: "narrow-path", level: 1, epic: false } as const;

function runnerOf(tokens: string[], outcome: RunOutcome, thoughts: string[] = []): Runner {
  return (_req, onTurn) => {
    tokens.forEach((token, i) => onTurn(i + 1, token, thoughts));
    return { done: Promise.resolve(outcome), cancel: () => {} };
  };
}

describe("startFloorRun", () => {
  it("re-simulates the tokens and passes a floor walked to the stairs", async () => {
    const walks = Array.from({ length: 7 }, () => "w-");
    const outcome: RunOutcome = { kind: "finished", log: `1:${walks.join("")}`, thoughts: [] };
    const { done } = startFloorRun(ref, "", runnerOf(walks, outcome, ["hello"]));
    const run = await done;
    expect(run.status).toBe("passed");
    expect(run.result.turns).toBe(7);
    expect(run.log).toBe(`1:${walks.join("")}`);
    expect(run.thoughts).toHaveLength(7);
    expect(run.outcome).toBeNull();
    expect(run.ranNothing).toBe(false);
  });

  it("reports an end without a pass as the engine's own words", async () => {
    const idle = ["w-"];
    const outcome: RunOutcome = { kind: "finished", log: "1:r-r-", thoughts: [] };
    const run = await startFloorRun(ref, "", runnerOf(idle, outcome)).done;
    expect(run.result.passed).toBe(false);
    expect(run.status).toBe("playing");
  });

  it("keeps the turns that arrived before a timeout, and flags a run that never started", async () => {
    const timeout: RunOutcome = { kind: "timeout", log: "1:w-", phase: "turn", t: 2 };
    const partial = await startFloorRun(ref, "", runnerOf(["w-"], timeout)).done;
    expect(partial.frames).toHaveLength(
      towerFrames("narrow-path", 1, [{ name: "walk", direction: null }]).length,
    );
    expect(partial.outcome?.text).toContain("Turn 2");
    expect(partial.ranNothing).toBe(false);

    const none = await startFloorRun(ref, "", runnerOf([], { kind: "no-worker" })).done;
    expect(none.ranNothing).toBe(true);
    expect(none.frames).toHaveLength(1);
  });
});

describe("startDailyRun", () => {
  it("replays the day's floor and scores the bot's log as the server will", async () => {
    const log = "1:h0h0h0h0h0w0w0w0s0h0h0h0h0w0w0w0w0";
    const tokens = log.slice(2).match(/../g) ?? [];
    const outcome: RunOutcome = { kind: "finished", log, thoughts: [] };
    let sent: unknown = null;
    const runner: Runner = (req, onTurn) => {
      sent = req.level;
      tokens.forEach((token, i) => onTurn(i + 1, token, []));
      return { done: Promise.resolve(outcome), cancel: () => {} };
    };
    const run = await startDailyRun("2026-10-15", "", runner).done;
    expect(sent).toEqual({ kind: "daily", day: "2026-10-15" });
    expect(run.ref).toEqual({ kind: "daily", day: "2026-10-15" });
    expect(run.status).toBe("passed");
    expect(run.result.score?.total).toBe(118);
    expect(run.result.turns).toBe(17);
    expect(run.log).toBe(log);
  });
});

describe("cueFor", () => {
  it("maps events to cues that exist, and stays silent for the rest", () => {
    for (const type of ["walk", "takeDamage", "rescue"]) {
      const cue = cueFor(type);
      expect(cue && cue in CUES).toBe(true);
    }
    expect(cueFor("think")).toBeNull();
  });

  it("ends a replay with the stairs cue on a pass and the fail cue otherwise", () => {
    expect(endCue(true)).toBe("stairs");
    expect(endCue(false)).toBe("fail");
    expect(CUES.stairs.ms).toBeGreaterThan(0);
    expect(CUES.fail.ms).toBeGreaterThan(0);
  });
});

describe("usePlayback", () => {
  const frames = towerFrames("narrow-path", 1, [{ name: "walk", direction: null }]);

  it("steps, scrubs and pauses like a video player", () => {
    const { result } = renderHook(() => usePlayback(frames, "instant"));
    act(() => result.current.skipToEnd());
    expect(result.current.index).toBe(frames.length - 1);
    act(() => result.current.stepBack());
    expect(result.current.index).toBe(frames.length - 2);
    expect(result.current.playing).toBe(false);
    act(() => result.current.scrubTo(0));
    expect(result.current.index).toBe(0);
    act(() => result.current.skipToEnd());
    expect(result.current.atEnd).toBe(true);
  });
});
