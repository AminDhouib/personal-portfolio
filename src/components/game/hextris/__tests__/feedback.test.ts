import { describe, it, expect, vi } from "vitest";
import type { EngineEvent } from "../engine/types";
import {
  COMBO_COLOURS,
  feedbackFor,
  musicTempo,
  playCue,
  shrinkCountdown,
  type FeedbackMemo,
} from "../feedback";

const memo = (combo = 1): FeedbackMemo => ({ combo });

const clear = (combo: number, chain = false): EngineEvent => ({
  type: "clear",
  cells: [],
  count: 3,
  colour: 0,
  combo,
  chain,
  points: 9 * combo,
});

const comboUp = (combo: number): EngineEvent => ({ type: "combo", cells: [], combo, points: 0 });

describe("feedbackFor", () => {
  it("does nothing for an empty batch or for events the shell ignores", () => {
    const quiet: EngineEvent[] = [
      { type: "spawn", id: 1, lane: 0, colour: 0, special: "none" },
      { type: "gravity" },
      { type: "level", level: 2 },
    ];
    for (const events of [[], quiet]) {
      const f = feedbackFor(events, memo());
      expect(f.sounds).toEqual([]);
      expect(f.haptics).toEqual([]);
      expect(f.phase).toBeNull();
      expect(f.over).toBeNull();
      expect(f.score).toBeNull();
      expect(f.scorePulse).toBe(false);
      expect(f.combo).toBeNull();
      expect(f.momentum).toBeNull();
      expect(f.milestone).toBeNull();
      expect(f.rotated).toBe(false);
      expect(f.boundaryDropAt).toBeUndefined();
      expect(f.countdown).toBeUndefined();
    }
  });

  it("resets the HUD when a run starts", () => {
    const m = memo(6);
    const f = feedbackFor([{ type: "run-start" }], m);
    expect(f.phase).toBe("playing");
    expect(f.score).toBe(0);
    expect(f.scorePulse).toBe(false);
    expect(f.combo).toBe(1);
    expect(f.momentum).toBe(0);
    expect(f.boundaryDropAt).toBeNull();
    expect(m.combo).toBe(1);
  });

  it("calls the first count of the countdown with the run start", () => {
    const f = feedbackFor([{ type: "run-start" }, { type: "countdown", count: 3 }], memo());
    expect(f.phase).toBe("playing");
    expect(f.countdown).toBe(3);
    expect(f.sounds).toEqual([{ cue: "countdown" }]);
  });

  it("shows each count with a tick, and clears the digits with the go cue", () => {
    const two = feedbackFor([{ type: "countdown", count: 2 }], memo());
    expect(two.countdown).toBe(2);
    expect(two.sounds).toEqual([{ cue: "countdown" }]);
    const go = feedbackFor([{ type: "go" }], memo());
    expect(go.countdown).toBeNull();
    expect(go.sounds).toEqual([{ cue: "go" }]);
    expect(go.phase).toBeNull();
  });

  it("maps pause and resume to the shell phase", () => {
    expect(feedbackFor([{ type: "pause" }], memo()).phase).toBe("paused");
    expect(feedbackFor([{ type: "resume" }], memo()).phase).toBe("playing");
  });

  it("clicks and buzzes on a rotation and marks it so the tutorial can close", () => {
    const f = feedbackFor([{ type: "rotate", dir: -1 }], memo());
    expect(f.sounds).toEqual([{ cue: "rotate" }]);
    expect(f.haptics).toEqual([8]);
    expect(f.rotated).toBe(true);
  });

  it("plays the settle cue when a piece lands", () => {
    const f = feedbackFor(
      [{ type: "settle", side: 2, row: 0, colour: 1, special: "none" }],
      memo(),
    );
    expect(f.sounds).toEqual([{ cue: "settle" }]);
  });

  it("plays the match cue at the clear's combo, with a buzz that grows with the combo", () => {
    expect(feedbackFor([clear(1)], memo()).sounds).toEqual([{ cue: "match", combo: 1 }]);
    expect(feedbackFor([clear(1)], memo()).haptics).toEqual([[20]]);
    expect(feedbackFor([clear(2)], memo()).haptics).toEqual([[20]]);
    expect(feedbackFor([clear(3)], memo()).haptics).toEqual([[30, 20, 30]]);
  });

  it("gives a clear that set off a bomb the bomb buzz, and only that clear", () => {
    const f = feedbackFor([{ type: "bomb", side: 1, row: 0 }, clear(1), clear(3)], memo());
    expect(f.haptics).toEqual([
      [50, 30, 80],
      [30, 20, 30],
    ]);
  });

  it("plays the combo cue and shows a burst when the combo rises", () => {
    const m = memo(1);
    const f = feedbackFor([clear(2), comboUp(2)], m);
    expect(f.sounds).toEqual([
      { cue: "match", combo: 2 },
      { cue: "combo", combo: 2 },
    ]);
    expect(f.combo).toBe(2);
    expect(f.milestone).toEqual({ text: "\u00d72 COMBO!", color: COMBO_COLOURS[0] });
    expect(m.combo).toBe(2);
  });

  it("steps the burst colour with the combo and labels a chain", () => {
    const f = feedbackFor([clear(9, true), comboUp(9)], memo(7));
    expect(f.milestone).toEqual({
      text: "\u00d79 CHAIN!",
      color: COMBO_COLOURS[(9 - 2) % COMBO_COLOURS.length],
    });
  });

  it("drops the combo silently when a clear lands outside the window", () => {
    const m = memo(4);
    const f = feedbackFor([clear(1), comboUp(1)], m);
    expect(f.sounds).toEqual([{ cue: "match", combo: 1 }]);
    expect(f.milestone).toBeNull();
    expect(f.combo).toBe(1);
    expect(m.combo).toBe(1);
  });

  it("drops the combo when its window expires", () => {
    const m = memo(5);
    const f = feedbackFor([{ type: "combo-expired" }], m);
    expect(f.combo).toBe(1);
    expect(f.sounds).toEqual([]);
    expect(m.combo).toBe(1);
  });

  it("lets a clean sweep outrank the combo burst it arrives with", () => {
    const f = feedbackFor(
      [
        clear(3),
        comboUp(3),
        { type: "clean-sweep", cells: [], combo: 3, points: 3000 },
        { type: "score", score: 3100 },
      ],
      memo(2),
    );
    expect(f.milestone).toEqual({ text: "CLEAN SWEEP!", color: "#fde047" });
    expect(f.sounds).toContainEqual({ cue: "clean-sweep" });
    expect(f.haptics).toContainEqual([80, 40, 80, 40, 120]);
  });

  it("keeps a big burst when a combo burst follows it in the same batch", () => {
    const f = feedbackFor([{ type: "boundary-drop", limit: 11 }, clear(2), comboUp(2)], memo(1));
    expect(f.milestone?.text).toBe("BOUNDARY TIGHTENS");
  });

  it("announces Panic Clear", () => {
    const f = feedbackFor(
      [
        { type: "panic", cells: 20, points: 600 },
        { type: "momentum", value: 0 },
        { type: "score", score: 900 },
      ],
      memo(),
    );
    expect(f.milestone).toEqual({ text: "PANIC CLEAR", color: "#a78bfa" });
    expect(f.sounds).toEqual([{ cue: "clean-sweep" }]);
    expect(f.haptics).toEqual([[100, 40, 100, 40, 100]]);
    expect(f.momentum).toBe(0);
    expect(f.score).toBe(900);
  });

  it("arms the shrink countdown on a warning and ends it on the drop", () => {
    const warn = feedbackFor(
      [{ type: "boundary-warning", dropAtMs: 70_000, nextLimit: 11 }],
      memo(),
    );
    expect(warn.boundaryDropAt).toBe(70_000);
    expect(warn.sounds).toEqual([]);

    const drop = feedbackFor([{ type: "boundary-drop", limit: 11 }], memo());
    expect(drop.boundaryDropAt).toBeNull();
    expect(drop.milestone).toEqual({ text: "BOUNDARY TIGHTENS", color: "#f59e0b" });
    expect(drop.sounds).toEqual([{ cue: "boundary-shrink" }]);
    expect(drop.haptics).toEqual([[40, 20, 40]]);
  });

  it("reports the latest score with a pulse, and the momentum as a whole percent", () => {
    const f = feedbackFor(
      [
        { type: "score", score: 9 },
        { type: "score", score: 25 },
        { type: "momentum", value: 4.5 },
        { type: "momentum", value: 12.5 },
      ],
      memo(),
    );
    expect(f.score).toBe(25);
    expect(f.scorePulse).toBe(true);
    expect(f.momentum).toBe(12);
  });

  it("ends the run with its result and the game-over rumble", () => {
    const f = feedbackFor([{ type: "game-over", side: 4, score: 1234, cellsCleared: 56 }], memo());
    expect(f.phase).toBe("over");
    expect(f.over).toEqual({ side: 4, score: 1234, cellsCleared: 56 });
    expect(f.haptics).toEqual([[80, 40, 80, 40, 80]]);
  });
});

describe("shrinkCountdown", () => {
  it("counts whole seconds up to the drop, then stops", () => {
    expect(shrinkCountdown(70_000, 60_000)).toBe(10);
    expect(shrinkCountdown(70_000, 60_999)).toBe(10);
    expect(shrinkCountdown(70_000, 61_000)).toBe(9);
    expect(shrinkCountdown(70_000, 69_999)).toBe(1);
    expect(shrinkCountdown(70_000, 70_000)).toBeNull();
    expect(shrinkCountdown(70_000, 71_000)).toBeNull();
  });
});

describe("musicTempo", () => {
  it("rises two beats a minute per level from 105, up to level 35", () => {
    expect(musicTempo(1)).toBe(107);
    expect(musicTempo(10.5)).toBe(126);
    expect(musicTempo(35)).toBe(175);
    expect(musicTempo(50)).toBe(175);
  });
});

describe("playCue", () => {
  it("sends each cue to its sound", () => {
    const player = {
      rotate: vi.fn(),
      settle: vi.fn(),
      match: vi.fn(),
      combo: vi.fn(),
      cleanSweep: vi.fn(),
      boundaryShrink: vi.fn(),
      countdown: vi.fn(),
      go: vi.fn(),
    };
    playCue(player, { cue: "rotate" });
    playCue(player, { cue: "settle" });
    playCue(player, { cue: "match", combo: 3 });
    playCue(player, { cue: "combo", combo: 4 });
    playCue(player, { cue: "clean-sweep" });
    playCue(player, { cue: "boundary-shrink" });
    playCue(player, { cue: "countdown" });
    playCue(player, { cue: "go" });
    expect(player.rotate).toHaveBeenCalledOnce();
    expect(player.settle).toHaveBeenCalledOnce();
    expect(player.match).toHaveBeenCalledWith(3);
    expect(player.combo).toHaveBeenCalledWith(4);
    expect(player.cleanSweep).toHaveBeenCalledOnce();
    expect(player.boundaryShrink).toHaveBeenCalledOnce();
    expect(player.countdown).toHaveBeenCalledOnce();
    expect(player.go).toHaveBeenCalledOnce();
  });
});
