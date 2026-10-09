import { describe, expect, it } from "vitest";
import type { LevelRef } from "../engine/level-ref";
import { emptyProgress, FLOORS_PER_TOWER, recordClear, type Progress } from "../progress";
import { LOCKED_NOTICE, resolveStart } from "../start-at";

const clear = { score: 50, grade: 0.8, turns: 10 };

function cleared(upTo: number, tower: "narrow-path" | "powder-keep" = "narrow-path"): Progress {
  let progress = emptyProgress();
  for (let level = 1; level <= upTo; level += 1) {
    progress = recordClear(progress, tower, level, clear);
  }
  return progress;
}

const tower = (t: "narrow-path" | "powder-keep", level: number, epic = false): LevelRef => ({
  kind: "tower",
  tower: t,
  level,
  epic,
});

describe("resolveStart", () => {
  it("stays where the player was with no link", () => {
    const progress = emptyProgress();
    expect(resolveStart(undefined, progress)).toEqual({
      daily: false,
      at: progress.at,
      notice: null,
    });
  });

  it("opens Today's floor for any daily link, today's or old", () => {
    expect(resolveStart({ kind: "daily", day: "2020-01-01" }, emptyProgress()).daily).toBe(true);
  });

  it("opens a tower floor the player has reached", () => {
    const start = resolveStart(tower("narrow-path", 3), cleared(4));
    expect(start).toEqual({
      daily: false,
      at: { tower: "narrow-path", level: 3, epic: false },
      notice: null,
    });
  });

  it("clamps a floor the player has not reached to the furthest they have, and says so", () => {
    const start = resolveStart(tower("narrow-path", 8), cleared(2));
    expect(start.at).toEqual({ tower: "narrow-path", level: 3, epic: false });
    expect(start.notice).toBe(LOCKED_NOTICE);
  });

  it("sends a locked tower to where the player is, and says so", () => {
    const progress = cleared(2);
    const start = resolveStart(tower("powder-keep", 1), progress);
    expect(start.at.tower).toBe("narrow-path");
    expect(start.notice).toBe(LOCKED_NOTICE);
  });

  it("opens an unlocked second tower", () => {
    const progress = cleared(FLOORS_PER_TOWER);
    expect(resolveStart(tower("powder-keep", 1), progress).at).toEqual({
      tower: "powder-keep",
      level: 1,
      epic: false,
    });
  });

  it("drops epic until the tower's ninth floor is cleared, silently", () => {
    const start = resolveStart(tower("narrow-path", 2, true), cleared(3));
    expect(start.at.epic).toBe(false);
    expect(resolveStart(tower("narrow-path", 2, true), cleared(FLOORS_PER_TOWER)).at.epic).toBe(
      true,
    );
  });
});
