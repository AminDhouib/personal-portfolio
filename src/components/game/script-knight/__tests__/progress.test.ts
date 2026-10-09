import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOWERS } from "../engine/towers";
import {
  emptyProgress,
  FLOORS_PER_TOWER,
  isTowerUnlocked,
  loadProgress,
  parseProgress,
  PROGRESS_KEY,
  recordClear,
  recordEpic,
  saveProgress,
  setAt,
} from "../progress";

const safeStorage = vi.hoisted(() => ({ calls: [] as [string, string][] }));
vi.mock("@/lib/safe-storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/safe-storage")>();
  return {
    ...real,
    safeLocalSet: (key: string, value: string) => {
      safeStorage.calls.push([key, value]);
      return real.safeLocalSet(key, value);
    },
  };
});

beforeEach(() => {
  window.localStorage.clear();
  safeStorage.calls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const CLEAR = { score: 40, grade: 0.8, turns: 12 };

describe("knight:progress storage", () => {
  it("has its own key and the pinned empty shape", () => {
    expect(PROGRESS_KEY).toBe("knight:progress");
    expect(emptyProgress()).toEqual({
      v: 1,
      towers: {
        "narrow-path": { reached: 1, best: {}, epic: null },
        "powder-keep": { reached: 1, best: {}, epic: null },
      },
      at: { tower: "narrow-path", level: 1, epic: false },
    });
  });

  it("matches the floors each tower really has", () => {
    expect(TOWERS["narrow-path"].levels).toHaveLength(FLOORS_PER_TOWER);
    expect(TOWERS["powder-keep"].levels).toHaveLength(FLOORS_PER_TOWER);
  });

  it("writes exactly this JSON (the pinned stored shape), through safeLocalSet", () => {
    saveProgress(emptyProgress());
    const json =
      '{"v":1,"towers":{"narrow-path":{"reached":1,"best":{},"epic":null},' +
      '"powder-keep":{"reached":1,"best":{},"epic":null}},' +
      '"at":{"tower":"narrow-path","level":1,"epic":false}}';
    expect(window.localStorage.getItem("knight:progress")).toBe(json);
    expect(safeStorage.calls).toEqual([[PROGRESS_KEY, json]]);
  });

  it("round-trips a saved record", () => {
    let progress = recordClear(emptyProgress(), "narrow-path", 3, CLEAR);
    progress = recordEpic(progress, "narrow-path", { score: 300, grades: [1, 0.9, 0.8] });
    progress = setAt(progress, { tower: "narrow-path", level: 4, epic: false });
    saveProgress(progress);
    expect(loadProgress()).toEqual(progress);
  });

  it("loads the empty record from empty, corrupt or blocked storage", () => {
    expect(loadProgress()).toEqual(emptyProgress());
    window.localStorage.setItem(PROGRESS_KEY, "{not json");
    expect(loadProgress()).toEqual(emptyProgress());
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(loadProgress()).toEqual(emptyProgress());
  });

  it("returns a fresh object each time, never a shared one", () => {
    const a = emptyProgress();
    a.towers["narrow-path"].reached = 5;
    expect(emptyProgress().towers["narrow-path"].reached).toBe(1);
    expect(loadProgress()).not.toBe(loadProgress());
  });

  it("leaves a record from a newer build alone", () => {
    window.localStorage.setItem(PROGRESS_KEY, '{"v":2,"future":true}');
    saveProgress(recordClear(emptyProgress(), "narrow-path", 1, CLEAR));
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('{"v":2,"future":true}');
    expect(safeStorage.calls).toEqual([]);
  });

  it("survives a refused write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => saveProgress(emptyProgress())).not.toThrow();
  });
});

describe("parseProgress", () => {
  it("returns the empty record for null, non-objects and a wrong version", () => {
    for (const bad of [null, undefined, 7, "x", [], { v: 2, towers: {} }, { towers: {} }]) {
      expect(parseProgress(bad)).toEqual(emptyProgress());
    }
  });

  it("falls back per field: a bad reached next to a good best keeps the best", () => {
    const parsed = parseProgress({
      v: 1,
      towers: {
        "narrow-path": { reached: "lots", best: { "2": CLEAR }, epic: null },
      },
    });
    expect(parsed.towers["narrow-path"].reached).toBe(1);
    expect(parsed.towers["narrow-path"].best).toEqual({ "2": CLEAR });
  });

  it("drops a malformed best entry and any key that is not a floor, keeping the rest", () => {
    const parsed = parseProgress({
      v: 1,
      towers: {
        "narrow-path": {
          reached: 4,
          best: {
            "1": CLEAR,
            "2": { score: -4, grade: 1, turns: 3 },
            "3": "no",
            "10": CLEAR,
            constructor: CLEAR,
          },
          epic: null,
        },
      },
    });
    expect(Object.keys(parsed.towers["narrow-path"].best)).toEqual(["1"]);
    expect(parsed.towers["narrow-path"].reached).toBe(4);
  });

  it("clamps reached to 1..9", () => {
    const make = (reached: number) =>
      parseProgress({ v: 1, towers: { "narrow-path": { reached, best: {}, epic: null } } }).towers[
        "narrow-path"
      ].reached;
    expect(make(99)).toBe(9);
    expect(make(0)).toBe(1);
    expect(make(-5)).toBe(1);
    expect(make(3.7)).toBe(3);
  });

  it("keeps a good epic record and drops a bad one", () => {
    const epic = { score: 300, grades: [1, 0.9] };
    const good = parseProgress({
      v: 1,
      towers: { "narrow-path": { reached: 1, best: {}, epic } },
    });
    expect(good.towers["narrow-path"].epic).toEqual(epic);
    const bad = parseProgress({
      v: 1,
      towers: { "narrow-path": { reached: 1, best: {}, epic: { score: "x", grades: 4 } } },
    });
    expect(bad.towers["narrow-path"].epic).toBeNull();
  });

  it("falls back on a bad position marker, field by field", () => {
    const parsed = parseProgress({ v: 1, at: { tower: "elsewhere", level: 12, epic: "yes" } });
    expect(parsed.at).toEqual({ tower: "narrow-path", level: 1, epic: false });
    const mixed = parseProgress({ v: 1, at: { tower: "powder-keep", level: 12, epic: true } });
    expect(mixed.at).toEqual({ tower: "powder-keep", level: 1, epic: true });
  });
});

describe("recordClear", () => {
  it("opens the next floor and keeps the best score per floor", () => {
    let progress = recordClear(emptyProgress(), "narrow-path", 1, CLEAR);
    expect(progress.towers["narrow-path"].reached).toBe(2);
    expect(progress.towers["narrow-path"].best["1"]).toEqual(CLEAR);
    progress = recordClear(progress, "narrow-path", 1, { score: 30, grade: 0.6, turns: 20 });
    expect(progress.towers["narrow-path"].best["1"]).toEqual(CLEAR);
    progress = recordClear(progress, "narrow-path", 1, { score: 50, grade: 1, turns: 9 });
    expect(progress.towers["narrow-path"].best["1"]).toEqual({ score: 50, grade: 1, turns: 9 });
  });

  it("never lets reached exceed 9 or drop on a lower clear", () => {
    let progress = recordClear(emptyProgress(), "narrow-path", 5, CLEAR);
    expect(progress.towers["narrow-path"].reached).toBe(6);
    progress = recordClear(progress, "narrow-path", 2, CLEAR);
    expect(progress.towers["narrow-path"].reached).toBe(6);
    progress = recordClear(progress, "narrow-path", 9, CLEAR);
    expect(progress.towers["narrow-path"].reached).toBe(9);
  });

  it("does not change the record it was given", () => {
    const before = emptyProgress();
    recordClear(before, "narrow-path", 1, CLEAR);
    expect(before).toEqual(emptyProgress());
  });

  it("ignores a floor the tower does not have", () => {
    const progress = recordClear(emptyProgress(), "narrow-path", 10, CLEAR);
    expect(progress).toEqual(emptyProgress());
  });
});

describe("recordEpic", () => {
  it("keeps the higher epic score", () => {
    let progress = recordEpic(emptyProgress(), "narrow-path", { score: 200, grades: [1] });
    progress = recordEpic(progress, "narrow-path", { score: 100, grades: [0.5] });
    expect(progress.towers["narrow-path"].epic).toEqual({ score: 200, grades: [1] });
    progress = recordEpic(progress, "narrow-path", { score: 250, grades: [1, 1] });
    expect(progress.towers["narrow-path"].epic).toEqual({ score: 250, grades: [1, 1] });
  });
});

describe("tower unlocking", () => {
  it("opens Powder Keep only after The Narrow Path's ninth floor is cleared", () => {
    let progress = emptyProgress();
    expect(isTowerUnlocked(progress, "narrow-path")).toBe(true);
    expect(isTowerUnlocked(progress, "powder-keep")).toBe(false);
    for (let level = 1; level <= 8; level += 1) {
      progress = recordClear(progress, "narrow-path", level, CLEAR);
    }
    expect(isTowerUnlocked(progress, "powder-keep")).toBe(false);
    progress = recordClear(progress, "narrow-path", 9, CLEAR);
    expect(isTowerUnlocked(progress, "powder-keep")).toBe(true);
  });
});

describe("the source", () => {
  it("never calls setItem itself", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const text = readFileSync(join(__dirname, "..", "progress.ts"), "utf8");
    expect(text).not.toMatch(/\.setItem\(/);
  });
});
