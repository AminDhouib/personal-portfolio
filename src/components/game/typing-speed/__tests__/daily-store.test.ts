import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAILY_KEY,
  HANDLE_MAX,
  loadDaily,
  markPosted,
  recordAttempt,
  saveDaily,
  setHandle,
  type DailyRecord,
} from "../daily-store";

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const DAY = "2026-10-08";
const fresh = (over: Partial<DailyRecord> = {}): DailyRecord => ({
  v: 1,
  day: DAY,
  handle: "",
  attempts: 0,
  best: null,
  posted: null,
  ...over,
});
const attempt = (over: Partial<Parameters<typeof recordAttempt>[1]> = {}) => ({
  wpm: 60,
  ms: 60_000,
  chars: 300,
  acc: 97,
  bulk: false,
  ...over,
});

describe("typing:daily storage", () => {
  it("has its own key and the pinned v1 shape", () => {
    expect(DAILY_KEY).toBe("typing:daily");
    expect(HANDLE_MAX).toBe(12);
    expect(loadDaily(DAY)).toEqual(fresh());
  });

  it("round-trips a record through the key as v1 JSON", () => {
    const rec = fresh({
      handle: "Ada",
      attempts: 2,
      best: { wpm: 60, ms: 60_000, chars: 300, acc: 97 },
      posted: 60,
    });
    saveDaily(rec);
    expect(JSON.parse(localStorage.getItem(DAILY_KEY) as string)).toEqual(rec);
    expect(loadDaily(DAY)).toEqual(rec);
  });

  it("loads fresh from corrupt JSON, a non-object and a wrong version", () => {
    for (const text of ["{nope", "42", "null", JSON.stringify({ ...fresh(), v: 2, attempts: 5 })]) {
      localStorage.setItem(DAILY_KEY, text);
      expect(loadDaily(DAY)).toEqual(fresh());
    }
  });

  it("falls back per field: a bad best or posted does not cost the handle and attempts", () => {
    localStorage.setItem(
      DAILY_KEY,
      JSON.stringify({
        v: 1,
        day: DAY,
        handle: "Ada",
        attempts: 3,
        best: { wpm: "fast", ms: 1, chars: 1, acc: 1 },
        posted: -4,
      }),
    );
    expect(loadDaily(DAY)).toEqual(fresh({ handle: "Ada", attempts: 3 }));
  });

  it("rejects a best with a float, a negative or an accuracy over 100", () => {
    for (const best of [
      { wpm: 60.5, ms: 60_000, chars: 300, acc: 97 },
      { wpm: -1, ms: 60_000, chars: 300, acc: 97 },
      { wpm: 60, ms: 60_000, chars: 300, acc: 101 },
    ]) {
      localStorage.setItem(DAILY_KEY, JSON.stringify({ ...fresh(), attempts: 1, best }));
      expect(loadDaily(DAY).best).toBeNull();
    }
  });

  it("caps a stored handle at 12 characters", () => {
    localStorage.setItem(DAILY_KEY, JSON.stringify(fresh({ handle: "a-very-long-handle-indeed" })));
    expect(loadDaily(DAY).handle).toBe("a-very-long-");
  });

  it("another day's record loads fresh but keeps the handle", () => {
    saveDaily(
      fresh({
        day: "2026-10-07",
        handle: "Ada",
        attempts: 4,
        best: { wpm: 80, ms: 40_000, chars: 300, acc: 99 },
        posted: 80,
      }),
    );
    expect(loadDaily(DAY)).toEqual(fresh({ handle: "Ada" }));
  });

  it("leaves a newer build's record alone on save", () => {
    const newer = JSON.stringify({ v: 2, anything: true });
    localStorage.setItem(DAILY_KEY, newer);
    saveDaily(fresh({ attempts: 1 }));
    expect(localStorage.getItem(DAILY_KEY)).toBe(newer);
  });

  it("survives blocked storage on load and save", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadDaily(DAY)).toEqual(fresh());
    expect(() => saveDaily(fresh())).not.toThrow();
  });
});

describe("recordAttempt", () => {
  it("counts every attempt and keeps the higher WPM", () => {
    let rec = recordAttempt(fresh(), attempt({ wpm: 60 }));
    rec = recordAttempt(rec, attempt({ wpm: 72, ms: 50_000, chars: 300 }));
    rec = recordAttempt(rec, attempt({ wpm: 65 }));
    expect(rec.attempts).toBe(3);
    expect(rec.best).toEqual({ wpm: 72, ms: 50_000, chars: 300, acc: 97 });
  });

  it("keeps the earlier attempt on a tie", () => {
    let rec = recordAttempt(fresh(), attempt({ wpm: 60, acc: 90 }));
    rec = recordAttempt(rec, attempt({ wpm: 60, acc: 99 }));
    expect(rec.best?.acc).toBe(90);
    expect(rec.attempts).toBe(2);
  });

  it("counts a bulk attempt but never makes it the best", () => {
    let rec = recordAttempt(fresh(), attempt({ wpm: 50 }));
    rec = recordAttempt(rec, attempt({ wpm: 200, bulk: true }));
    expect(rec.attempts).toBe(2);
    expect(rec.best?.wpm).toBe(50);
    expect(recordAttempt(fresh(), attempt({ bulk: true })).best).toBeNull();
  });

  it("does not make a zero-WPM attempt the best", () => {
    expect(recordAttempt(fresh(), attempt({ wpm: 0 })).best).toBeNull();
  });

  it("does not mutate its input", () => {
    const rec = fresh();
    recordAttempt(rec, attempt());
    expect(rec).toEqual(fresh());
  });
});

describe("markPosted and setHandle", () => {
  it("records the posted WPM", () => {
    expect(markPosted(fresh(), 72).posted).toBe(72);
  });

  it("caps the handle and returns the same object when unchanged", () => {
    const rec = fresh({ handle: "Ada" });
    expect(setHandle(rec, "Ada")).toBe(rec);
    expect(setHandle(rec, "0123456789abcdef").handle).toBe("0123456789ab");
  });
});
