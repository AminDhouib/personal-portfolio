import { describe, it, expect } from "vitest";
import { CUES, GAME_OVER_MS, LEVEL_WIN_MS, RISK_WARNING_MS, midiHz } from "../sound-cues";

describe("midiHz", () => {
  it("maps the standard reference pitches", () => {
    expect(midiHz(69)).toBeCloseTo(440, 6);
    expect(midiHz(81)).toBeCloseTo(880, 6);
    expect(midiHz(60)).toBeCloseTo(261.6256, 3);
  });
});

describe("CUES", () => {
  const entries = Object.entries(CUES);

  it("defines every cue the facade exposes", () => {
    expect(Object.keys(CUES).sort()).toEqual(
      [
        "backButton",
        "cursorMove",
        "decide",
        "flip",
        "gameOver",
        "invalidTap",
        "levelClear",
        "levelDown",
        "levelUp",
        "memoSlide",
        "memoToggle",
        "payoutFinal",
        "payoutTickBank",
        "payoutTickEarn",
        "riskWarning",
        "voltorbPop",
      ].sort(),
    );
  });

  it.each(entries)("%s: every voice starts and ends inside the cue", (_name, cue) => {
    expect(cue.ms).toBeGreaterThan(0);
    expect(cue.notes.length + cue.noise.length).toBeGreaterThan(0);
    for (const n of cue.notes) {
      expect(n.at).toBeGreaterThanOrEqual(0);
      expect(n.dur).toBeGreaterThan(0);
      expect(n.at + n.dur).toBeLessThanOrEqual(cue.ms);
    }
    for (const h of cue.noise) {
      expect(h.at).toBeGreaterThanOrEqual(0);
      expect(h.dur).toBeGreaterThan(0);
      expect(h.at + h.dur).toBeLessThanOrEqual(cue.ms);
    }
  });

  it.each(entries)("%s: pitches are finite and gains stay modest", (_name, cue) => {
    for (const n of cue.notes) {
      expect(Number.isFinite(n.hz) && n.hz > 20 && n.hz < 12000).toBe(true);
      if (n.toHz !== undefined) expect(Number.isFinite(n.toHz) && n.toHz > 20).toBe(true);
      expect(n.gain).toBeGreaterThan(0);
      expect(n.gain).toBeLessThanOrEqual(0.3);
    }
    for (const h of cue.noise) {
      expect(h.gain).toBeGreaterThan(0);
      expect(h.gain).toBeLessThanOrEqual(0.3);
      expect(h.lowpassHz).toBeGreaterThan(100);
    }
  });

  it("level up rises and level down falls", () => {
    const up = [...CUES.levelUp.notes].sort((a, b) => a.at - b.at);
    const down = [...CUES.levelDown.notes].sort((a, b) => a.at - b.at);
    expect(up[0]!.hz).toBeLessThan(up[up.length - 1]!.hz);
    expect(down[0]!.hz).toBeGreaterThan(down[down.length - 1]!.hz);
  });

  it("pins the durations the round flow waits on", () => {
    // RISK_WARNING_MS equals the literal the muted path in super-voltorb-flip.tsx waits.
    expect(RISK_WARNING_MS).toBe(2100);
    expect(CUES.riskWarning.ms).toBe(RISK_WARNING_MS);
    expect(CUES.levelClear.ms).toBe(LEVEL_WIN_MS);
    expect(CUES.gameOver.ms).toBe(GAME_OVER_MS);
    // The win sequence has a 4000 ms fallback timer; the fanfare must end well inside it.
    expect(LEVEL_WIN_MS).toBeGreaterThanOrEqual(1500);
    expect(LEVEL_WIN_MS).toBeLessThanOrEqual(3000);
  });

  it("keeps per-tick sounds short enough to overlap at the payout cadence", () => {
    // Drain/earn ticks fire every 4 steps of ~17 ms.
    expect(CUES.payoutTickBank.ms).toBeLessThanOrEqual(80);
    expect(CUES.payoutTickEarn.ms).toBeLessThanOrEqual(80);
  });
});
