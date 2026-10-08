import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GHOSTS_KEY,
  emptyGhosts,
  ghostFor,
  loadGhosts,
  offerGhost,
  saveGhosts,
  type GhostStore,
} from "../ghost-store";
import { applyOp, createRun } from "../engine/run";
import type { Op, TypingRun } from "../engine/types";

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const DAY = "2026-10-08";
const SAMPLES = [0, 2, 3, 4, 5, 6, 7, 8, 9];

const ch = (c: string): Op => ({ kind: "char", ch: c });

/** "aaaa bbbb" typed with `gap` ms between keys: 54 WPM at gap 250, 27 WPM at gap 500. */
function run(gap: number, bulk = 0): TypingRun {
  const r = createRun({ kind: "text", text: "aaaa bbbb" });
  const keys: Op[] = [ch("a"), ch("a"), ch("a"), ch("a"), { kind: "space" }];
  keys.push(ch("b"), ch("b"), ch("b"), ch("b"));
  keys.forEach((op, i) => applyOp(r, op, i * gap));
  r.bulk = bulk;
  return r;
}

function store(over: GhostStore["ghosts"] = {}): GhostStore {
  return { v: 1, ghosts: over };
}

function write(value: unknown) {
  localStorage.setItem(GHOSTS_KEY, typeof value === "string" ? value : JSON.stringify(value));
}

describe("the stored shape", () => {
  it("is { v: 1, ghosts: { [mode]: { wpm, samples } } }, with a day only on the daily", () => {
    saveGhosts(
      store({
        "words-15": { wpm: 54, samples: SAMPLES },
        daily: { wpm: 50, samples: SAMPLES, day: DAY },
      }),
    );
    expect(GHOSTS_KEY).toBe("typing:ghosts");
    expect(JSON.parse(localStorage.getItem(GHOSTS_KEY) as string)).toEqual({
      v: 1,
      ghosts: {
        "words-15": { wpm: 54, samples: SAMPLES },
        daily: { wpm: 50, samples: SAMPLES, day: DAY },
      },
    });
  });

  it("round-trips through load", () => {
    const s = store({ quote: { wpm: 70, samples: [0, 5, 9] } });
    saveGhosts(s);
    expect(loadGhosts(DAY)).toEqual(s);
  });
});

describe("loadGhosts is tolerant", () => {
  it("returns empty for missing, corrupt and wrong-version data", () => {
    expect(loadGhosts(DAY)).toEqual(emptyGhosts());
    write("{not json");
    expect(loadGhosts(DAY)).toEqual(emptyGhosts());
    write({ v: 2, ghosts: { "words-15": { wpm: 40, samples: [0, 1] } } });
    expect(loadGhosts(DAY)).toEqual(emptyGhosts());
    write({ v: 1, ghosts: "nope" });
    expect(loadGhosts(DAY)).toEqual(emptyGhosts());
    write([1, 2, 3]);
    expect(loadGhosts(DAY)).toEqual(emptyGhosts());
  });

  it("drops one ill-typed or unknown-mode entry and keeps the rest", () => {
    write({
      v: 1,
      ghosts: {
        "words-15": { wpm: 40, samples: [0, 1, 2] },
        "words-30": { wpm: "fast", samples: [0, 1] },
        "words-60": { wpm: 40 },
        "words-120": null,
        "quotes-15": { wpm: 40, samples: [0, 1.5] },
        "quotes-30": { wpm: 40, samples: [0, -1] },
        "quotes-60": { wpm: -3, samples: [0, 1] },
        "quotes-120": { wpm: 40, samples: [] },
        "words-999": { wpm: 40, samples: [0, 1] },
        quote: { wpm: 55, samples: [0, 3] },
      },
    });
    expect(loadGhosts(DAY).ghosts).toEqual({
      "words-15": { wpm: 40, samples: [0, 1, 2] },
      quote: { wpm: 55, samples: [0, 3] },
    });
  });

  it("caps samples at 481", () => {
    write({
      v: 1,
      ghosts: {
        "words-120": { wpm: 40, samples: Array.from({ length: 481 }, (_, i) => i) },
        "quotes-120": { wpm: 40, samples: Array.from({ length: 482 }, (_, i) => i) },
      },
    });
    expect(Object.keys(loadGhosts(DAY).ghosts)).toEqual(["words-120"]);
  });

  it("needs a day on the daily ghost and drops one from another day", () => {
    write({ v: 1, ghosts: { daily: { wpm: 50, samples: [0, 4] } } });
    expect(loadGhosts(DAY).ghosts).toEqual({});
    write({ v: 1, ghosts: { daily: { wpm: 50, samples: [0, 4], day: "2026-10-07" } } });
    expect(loadGhosts(DAY).ghosts).toEqual({});
    write({ v: 1, ghosts: { daily: { wpm: 50, samples: [0, 4], day: DAY } } });
    expect(loadGhosts(DAY).ghosts.daily).toEqual({ wpm: 50, samples: [0, 4], day: DAY });
  });

  it("returns empty when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(loadGhosts(DAY)).toEqual(emptyGhosts());
  });
});

describe("saveGhosts", () => {
  it("leaves a newer stored version alone", () => {
    const newer = { v: 2, ghosts: { "words-15": { wpm: 99, samples: [0, 9] } }, extra: true };
    write(newer);
    saveGhosts(store({ quote: { wpm: 10, samples: [0, 1] } }));
    expect(JSON.parse(localStorage.getItem(GHOSTS_KEY) as string)).toEqual(newer);
  });
});

describe("ghostFor", () => {
  it("returns the mode ghost, and a daily one only for its own day", () => {
    const s = store({
      "words-15": { wpm: 54, samples: SAMPLES },
      daily: { wpm: 50, samples: SAMPLES, day: DAY },
    });
    expect(ghostFor(s, "words-15")?.wpm).toBe(54);
    expect(ghostFor(s, "words-30")).toBeNull();
    expect(ghostFor(s, "daily", DAY)?.wpm).toBe(50);
    expect(ghostFor(s, "daily", "2026-10-09")).toBeNull();
    expect(ghostFor(s, "daily")).toBeNull();
  });
});

describe("offerGhost", () => {
  it("stores the first run as the ghost with its samples", () => {
    const next = offerGhost(emptyGhosts(), "words-15", run(250));
    expect(next.ghosts["words-15"]).toEqual({ wpm: 54, samples: SAMPLES });
  });

  it("replaces only on a strictly higher net WPM", () => {
    const base = offerGhost(emptyGhosts(), "words-15", run(250));
    expect(offerGhost(base, "words-15", run(500))).toBe(base); // 27 WPM, slower
    expect(offerGhost(base, "words-15", run(250))).toBe(base); // a tie keeps the earlier
    const faster = offerGhost(base, "words-15", run(150));
    expect(faster).not.toBe(base);
    expect(faster.ghosts["words-15"]?.wpm).toBe(90);
  });

  it("does not touch the store it was given", () => {
    const base = offerGhost(emptyGhosts(), "words-15", run(250));
    const frozen = structuredClone(base);
    offerGhost(base, "words-15", run(150));
    expect(base).toEqual(frozen);
  });

  it("ignores a bulk run, a zero run and a run too long for a ghost", () => {
    const empty = emptyGhosts();
    expect(offerGhost(empty, "words-15", run(150, 1))).toBe(empty);
    expect(offerGhost(empty, "words-15", createRun({ kind: "text", text: "ab" }))).toBe(empty);
    expect(offerGhost(empty, "quote", run(16_000))).toBe(empty); // 128 s: 513 samples
  });

  it("keeps one ghost per mode", () => {
    let s = offerGhost(emptyGhosts(), "words-15", run(250));
    s = offerGhost(s, "quote", run(500));
    expect(s.ghosts["words-15"]?.wpm).toBe(54);
    expect(s.ghosts.quote?.wpm).toBe(27);
  });

  it("stamps the daily ghost with its day and lets a new day replace a slower old one", () => {
    const yesterday = store({ daily: { wpm: 90, samples: [0, 9], day: "2026-10-07" } });
    const next = offerGhost(yesterday, "daily", run(250), DAY);
    expect(next.ghosts.daily).toEqual({ wpm: 54, samples: SAMPLES, day: DAY });
    // Within the day only a higher WPM replaces it.
    expect(offerGhost(next, "daily", run(500), DAY)).toBe(next);
    expect(offerGhost(next, "daily", run(150), DAY).ghosts.daily?.wpm).toBe(90);
  });

  it("ignores a daily offer without a day", () => {
    const empty = emptyGhosts();
    expect(offerGhost(empty, "daily", run(250))).toBe(empty);
  });
});
