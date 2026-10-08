// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DAILY_MAX_CHARS,
  DAILY_MIN_CHARS,
  DAILY_SEED_PREFIX,
  MS_PER_CHAR_FLOOR,
  WPM_CEILING,
  checkTypingDaily,
  dailyScore,
  dailyText,
  dayNumber,
} from "../engine/daily";

function daysOf(year: number): string[] {
  const out: string[] = [];
  for (let t = Date.UTC(year, 0, 1); new Date(t).getUTCFullYear() === year; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

describe("dailyText", () => {
  const days = daysOf(2026);

  it("is the same for the same day and has the documented shape", () => {
    const a = dailyText("2026-10-08");
    expect(dailyText("2026-10-08")).toEqual(a);
    expect(a.dayKey).toBe("2026-10-08");
    expect(Object.keys(a).sort()).toEqual(["dayKey", "passageId", "sourceId", "text"]);
  });

  it("changes from one day to the next on at least 300 of 365 days", () => {
    let changed = 0;
    for (let i = 1; i < days.length; i++) {
      if (dailyText(days[i]!).passageId !== dailyText(days[i - 1]!).passageId) changed++;
    }
    expect(changed).toBeGreaterThanOrEqual(300);
  });

  it("only picks passages of 180 to 360 characters and covers at least 20 of them", () => {
    const ids = new Set<string>();
    for (const d of days) {
      const t = dailyText(d);
      expect(t.text.length).toBeGreaterThanOrEqual(DAILY_MIN_CHARS);
      expect(t.text.length).toBeLessThanOrEqual(DAILY_MAX_CHARS);
      ids.add(t.passageId);
    }
    expect(ids.size).toBeGreaterThanOrEqual(20);
  });

  it("numbers a day as YYYYMMDD", () => {
    expect(dayNumber("2026-10-08")).toBe(20261008);
  });

  // Golden: bump DAILY_SEED_PREFIX if the recipe changes; old days must not shift.
  it("pins the passage of two days", () => {
    expect(DAILY_SEED_PREFIX).toBe("typing-daily-v1-");
    expect(dailyText("2026-10-08").passageId).toBe("stevenson-jh-2");
    expect(dailyText("2027-01-01").passageId).toBe("stoker-3");
  });
});

describe("checkTypingDaily", () => {
  const L = 300;
  const ok = (score: number, ms: number, chars = L) =>
    checkTypingDaily(L, score, { ms, chars, acc: 97 });

  it("accepts an honest run and the exact ceiling", () => {
    expect(ok(60, L * 200)).toBeNull(); // 300 chars in 60 s is 60 WPM
    expect(ok(300, L * MS_PER_CHAR_FLOOR)).toBeNull(); // 12 s, the floor
  });

  it("rejects a run shorter than the text allows", () => {
    // The score still matches (300), so only the duration is impossible.
    expect(ok(300, L * MS_PER_CHAR_FLOOR - 1)).toBe("run shorter than the text allows");
  });

  it("rejects more characters than the text has", () => {
    expect(checkTypingDaily(L, 61, { ms: 60_000, chars: L + 5, acc: 90 })).toBe(
      "more characters than the text has",
    );
  });

  it("rejects a score that does not match its characters and time", () => {
    expect(ok(61, L * 200)).toBe("score does not match the run");
    expect(ok(59, L * 200)).toBe("score does not match the run");
  });

  it("accepts a run with fewer net characters than the text has", () => {
    // 270 net characters in 60 s: round(270 * 12000 / 60000) = 54
    expect(checkTypingDaily(L, 54, { ms: 60_000, chars: 270, acc: 90 })).toBeNull();
  });

  it("ties the ceiling to the floor", () => {
    expect(WPM_CEILING).toBe(300);
    expect(MS_PER_CHAR_FLOOR).toBe(12_000 / WPM_CEILING);
  });

  it("scores net characters over milliseconds as whole WPM", () => {
    expect(dailyScore(300, 60_000)).toBe(60);
    expect(dailyScore(300, 60_001)).toBe(60);
    expect(dailyScore(1, 1_000)).toBe(12);
  });
});
