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
      "Top level: Level 8.",
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

  it("a quit that climbs says moved up, not dropped", () => {
    expect(roundResultCopy({ kind: "quit", fromLevel: 5, toLevel: 8, coins: 40 })).toEqual({
      title: "You quit. +40 coins",
      detail: "Moved up to Level 8.",
    });
    expect(roundResultCopy({ kind: "quit", fromLevel: 5, toLevel: 8, coins: 0 })).toEqual({
      title: "You quit with no coins.",
      detail: "Moved up to Level 8.",
    });
  });

  it("a loss that drops still says dropped", () => {
    expect(roundResultCopy({ kind: "lose", fromLevel: 3, toLevel: 2, coins: 0 }).detail).toBe(
      "Dropped to Level 2. No coins this round.",
    );
  });
});

describe("assisted rounds", () => {
  const base = { fromLevel: 3, toLevel: 3, coins: 12 };
  it("say so, on every kind of round, without touching the title", () => {
    for (const kind of ["win", "lose", "quit"] as const) {
      const plain = roundResultCopy({ ...base, kind });
      const assisted = roundResultCopy({ ...base, kind, assisted: true });
      expect(assisted.title).toBe(plain.title);
      expect(assisted.detail).toBe(`${plain.detail} Assisted: not in your record.`);
    }
  });
  it("are unchanged when assisted is false or absent", () => {
    expect(roundResultCopy({ ...base, kind: "win", assisted: false })).toEqual(
      roundResultCopy({ ...base, kind: "win" }),
    );
  });
});

describe("daily boards", () => {
  const base = { fromLevel: 5, toLevel: 5 };
  it("never talk about levels", () => {
    expect(roundResultCopy({ ...base, kind: "win", coins: 512, daily: true })).toEqual({
      title: "Board cleared! +512 coins",
      detail: "Every coin on today's board. A new one lands at 00:00 UTC.",
    });
    expect(roundResultCopy({ ...base, kind: "lose", coins: 0, daily: true })).toEqual({
      title: "Voltorb! Today's board is done.",
      detail: "No coins banked. A new board lands at 00:00 UTC.",
    });
    expect(roundResultCopy({ ...base, kind: "quit", coins: 12, daily: true })).toEqual({
      title: "You quit. +12 coins",
      detail: "Banked for today. A new board lands at 00:00 UTC.",
    });
    expect(roundResultCopy({ ...base, kind: "quit", coins: 0, daily: true })).toEqual({
      title: "You quit with no coins.",
      detail: "Banked for today. A new board lands at 00:00 UTC.",
    });
  });
  it("say nothing about assistance (there is no assist on the Daily board)", () => {
    const copy = roundResultCopy({ ...base, kind: "win", coins: 4, daily: true, assisted: true });
    expect(copy.detail).not.toContain("Assisted");
  });
});
