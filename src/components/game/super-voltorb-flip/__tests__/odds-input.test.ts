import { describe, it, expect } from "vitest";
import { VoltorbFlip } from "../engine";
import { buildSolverInput, oddsView, tileOddsView } from "../odds-input";

describe("buildSolverInput", () => {
  it("reads the clues, the level and no revealed tiles from a fresh board", () => {
    const game = new VoltorbFlip(5);
    const input = buildSolverInput(game);
    expect(input).not.toBeNull();
    expect(input?.rows).toHaveLength(5);
    expect(input?.cols).toHaveLength(5);
    expect(input?.revealed).toEqual(Array(25).fill(null));
    expect(input?.level).toBe(game.currentLevel);
    expect(input?.rows[0]).toEqual({
      coins: game.rowValues[0]?.coins,
      voltorbs: game.rowValues[0]?.voltorbs,
    });
  });

  it("passes flipped coin tiles as revealed values and never a hidden one", () => {
    const game = new VoltorbFlip(5);
    // Flip the first tile that is not a Voltorb.
    const flat = game.cells.flat();
    const index = flat.findIndex((c) => c.value !== "V");
    game.flipCell(Math.floor(index / 5), index % 5);
    const input = buildSolverInput(game);
    const shown = input?.revealed.filter((v) => v !== null) ?? [];
    expect(shown).toEqual([flat[index]?.value]);
    expect(input?.revealed[index]).toBe(flat[index]?.value);
  });

  it("is null for a board that is not 5x5 (the solver is 5x5 only)", () => {
    expect(buildSolverInput(new VoltorbFlip(4))).toBeNull();
  });
});

describe("oddsView", () => {
  const odds = (voltorb: number) => ({ voltorb, one: 0, two: 0, three: 0 });

  it("shows the Voltorb chance as a percentage and speaks it", () => {
    expect(oddsView(odds(0.25))).toEqual({ text: "25%", spoken: "25 percent Voltorb" });
  });

  it("is exact at the ends and never rounds a chance to a false certainty", () => {
    expect(oddsView(odds(0))).toEqual({ text: "0%", spoken: "no chance of a Voltorb" });
    expect(oddsView(odds(1))).toEqual({ text: "100%", spoken: "certainly a Voltorb" });
    expect(oddsView(odds(0.001))).toEqual({ text: "<1%", spoken: "under 1 percent Voltorb" });
    expect(oddsView(odds(0.999))).toEqual({ text: ">99%", spoken: "over 99 percent Voltorb" });
  });
});

describe("tileOddsView", () => {
  const tile = (voltorb: number) => ({ voltorb, one: 0, two: 0, three: 0 });
  const odds = { tiles: [tile(0.25), tile(0), tile(1)], best: 1 };
  const open = { flipped: false, peek: false, flipDown: false };

  it("builds the badge for a face-down tile and marks the suggested flip", () => {
    expect(tileOddsView(odds, 0, open)).toEqual({
      text: "25%",
      spoken: "25 percent Voltorb",
      best: false,
    });
    expect(tileOddsView(odds, 1, open)?.best).toBe(true);
  });

  it("is undefined without odds or for a tile the odds do not cover", () => {
    expect(tileOddsView(null, 0, open)).toBeUndefined();
    expect(tileOddsView(undefined, 0, open)).toBeUndefined();
    expect(tileOddsView(odds, 9, open)).toBeUndefined();
  });

  it("is undefined on a flipped tile", () => {
    expect(tileOddsView(odds, 0, { ...open, flipped: true })).toBeUndefined();
  });

  it("is undefined under peek", () => {
    expect(tileOddsView(odds, 0, { ...open, peek: true })).toBeUndefined();
  });

  it("is undefined during the flip-down", () => {
    expect(tileOddsView(odds, 0, { ...open, flipDown: true })).toBeUndefined();
  });
});
