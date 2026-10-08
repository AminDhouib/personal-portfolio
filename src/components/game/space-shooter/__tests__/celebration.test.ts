import { describe, it, expect } from "vitest";
import type { ArcadeBoardResult } from "@/hooks/use-arcade-board";
import { isWorldRecord, personalBestKind } from "../celebration";

const daily: ArcadeBoardResult = {
  period: "daily",
  board: "daily:2026-10-06",
  rank: 1,
  best: 900,
  improved: true,
};

function allTime(rank: number, improved: boolean, best = 500): ArcadeBoardResult {
  return { period: "all-time", board: "all-time", rank, best, improved };
}

describe("isWorldRecord", () => {
  it("is a world record when this run improved the all-time board and ranks first", () => {
    expect(isWorldRecord([allTime(1, true)], 500)).toBe(true);
  });

  it("is not one when the player is first but this run did not improve their best", () => {
    expect(isWorldRecord([allTime(1, false)], 100)).toBe(false);
  });

  it("is not one when the run improved the best but only to second place", () => {
    expect(isWorldRecord([allTime(2, true)], 500)).toBe(false);
  });

  it("reads the all-time board by period, whatever its position", () => {
    expect(isWorldRecord([daily, allTime(1, true)], 500)).toBe(true);
    // A first place on the daily board alone is not a world record.
    expect(isWorldRecord([daily, allTime(3, false)], 500)).toBe(false);
  });

  it("is not one for a zero score, or without an all-time board", () => {
    expect(isWorldRecord([allTime(1, true, 0)], 0)).toBe(false);
    expect(isWorldRecord([daily], 500)).toBe(false);
    expect(isWorldRecord([], 500)).toBe(false);
    expect(isWorldRecord(undefined, 500)).toBe(false);
  });
});

describe("personalBestKind", () => {
  it("calls a first scored run a first flight, not a personal best", () => {
    expect(personalBestKind(674, null)).toBe("first");
  });

  it("calls a beaten stored best a personal best", () => {
    expect(personalBestKind(900, 674)).toBe("best");
  });

  it("is nothing for a tie, a lower score or a zero run", () => {
    expect(personalBestKind(674, 674)).toBeNull();
    expect(personalBestKind(10, 674)).toBeNull();
    expect(personalBestKind(0, null)).toBeNull();
  });
});
