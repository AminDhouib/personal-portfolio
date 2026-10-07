import { describe, it, expect } from "vitest";
import { roundResultCopy } from "../round-result-copy";

describe("roundResultCopy", () => {
  it("a win that moves up says so and pays coins", () => {
    expect(roundResultCopy({ kind: "win", fromLevel: 2, toLevel: 3, coins: 24 })).toEqual({
      title: "Round cleared! +24 coins",
      detail: "Moved up to Level 3.",
    });
  });

  it("a win that holds the level explains the Level 8 streak", () => {
    expect(roundResultCopy({ kind: "win", fromLevel: 7, toLevel: 7, coins: 1152 })).toEqual({
      title: "Round cleared! +1152 coins",
      detail: "Staying on Level 7. Five strong rounds in a row reach Level 8.",
    });
  });

  it("a win at the top level names it", () => {
    expect(roundResultCopy({ kind: "win", fromLevel: 8, toLevel: 8, coins: 2187 }).detail).toBe(
      "Top level: Level 8",
    );
  });

  it("a single coin is singular", () => {
    expect(roundResultCopy({ kind: "win", fromLevel: 1, toLevel: 2, coins: 1 }).title).toBe(
      "Round cleared! +1 coin",
    );
  });

  it("a loss says the level dropped and that no coins were paid", () => {
    expect(roundResultCopy({ kind: "lose", fromLevel: 5, toLevel: 3, coins: 0 })).toEqual({
      title: "Voltorb! Round lost.",
      detail: "Dropped to Level 3. No coins this round.",
    });
  });

  it("a loss on Level 1 stays put", () => {
    expect(roundResultCopy({ kind: "lose", fromLevel: 1, toLevel: 1, coins: 0 }).detail).toBe(
      "Staying on Level 1. No coins this round.",
    );
  });

  it("a quit with coins banks them and reports the level move", () => {
    expect(roundResultCopy({ kind: "quit", fromLevel: 4, toLevel: 2, coins: 36 })).toEqual({
      title: "You quit. +36 coins",
      detail: "Dropped to Level 2.",
    });
  });

  it("a quit with no coins says so", () => {
    expect(roundResultCopy({ kind: "quit", fromLevel: 1, toLevel: 1, coins: 0 })).toEqual({
      title: "You quit with no coins.",
      detail: "Staying on Level 1.",
    });
  });
});
