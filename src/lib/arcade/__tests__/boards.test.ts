import { describe, it, expect } from "vitest";
import { BOARD_PERIODS, boardKey, isoWeekKey, retentionCutoffs, utcDayKey } from "../boards";

const DAY_MS = 86_400_000;
const at = (iso: string) => new Date(iso);

describe("BOARD_PERIODS", () => {
  it("lists all-time, weekly, daily in the order the submit response uses", () => {
    expect([...BOARD_PERIODS]).toEqual(["all-time", "weekly", "daily"]);
  });
});

describe("utcDayKey", () => {
  it("formats the UTC calendar day, zero padded", () => {
    expect(utcDayKey(at("2026-10-06T12:00:00.000Z"))).toBe("2026-10-06");
    expect(utcDayKey(at("2026-01-05T00:00:00.000Z"))).toBe("2026-01-05");
    expect(utcDayKey(at("2026-12-31T23:00:00.000Z"))).toBe("2026-12-31");
  });

  it("rolls over exactly at 00:00Z: 23:59:59.999Z and 00:00Z are different days", () => {
    expect(utcDayKey(at("2026-10-06T23:59:59.999Z"))).toBe("2026-10-06");
    expect(utcDayKey(at("2026-10-07T00:00:00.000Z"))).toBe("2026-10-07");
  });

  it("uses UTC, not the machine's local zone", () => {
    // 23:30 at UTC-08:00 is 07:30 the next day in UTC.
    expect(utcDayKey(at("2026-10-06T23:30:00-08:00"))).toBe("2026-10-07");
  });
});

describe("isoWeekKey", () => {
  it.each([
    ["2026-01-01", "2026-W01"],
    ["2027-01-01", "2026-W53"],
    ["2024-12-30", "2025-W01"],
    ["2025-12-29", "2026-W01"],
    ["2020-12-31", "2020-W53"],
    ["2021-01-03", "2020-W53"],
    ["2021-01-04", "2021-W01"],
    ["2026-10-04", "2026-W40"],
    ["2026-10-05", "2026-W41"],
    ["2026-10-06", "2026-W41"],
    ["2026-10-11", "2026-W41"],
    ["2026-10-12", "2026-W42"],
  ])("%s is in %s", (day, week) => {
    expect(isoWeekKey(at(`${day}T00:00:00.000Z`))).toBe(week);
    expect(isoWeekKey(at(`${day}T23:59:59.999Z`))).toBe(week);
  });

  it("zero pads the week number", () => {
    expect(isoWeekKey(at("2026-01-14T10:00:00.000Z"))).toBe("2026-W03");
  });
});

describe("boardKey", () => {
  const now = at("2026-10-06T12:00:00.000Z");

  it("maps each period to its key", () => {
    expect(boardKey("all-time", now)).toBe("all-time");
    expect(boardKey("weekly", now)).toBe("weekly:2026-W41");
    expect(boardKey("daily", now)).toBe("daily:2026-10-06");
  });

  it("all-time ignores the date", () => {
    expect(boardKey("all-time", at("1999-01-01T00:00:00.000Z"))).toBe("all-time");
  });
});

describe("retentionCutoffs", () => {
  it.each([
    ["2026-10-06T12:00:00.000Z", "daily:2026-09-06", "weekly:2026-W29"],
    ["2026-01-14T10:00:00.000Z", "daily:2025-12-15", "weekly:2025-W43"],
    ["2024-03-31T00:00:00.000Z", "daily:2024-03-01", "weekly:2024-W01"],
  ])("%s keeps daily boards from %s and weekly boards from %s", (iso, daily, weekly) => {
    expect(retentionCutoffs(at(iso))).toEqual({ daily, weekly });
  });

  // The store deletes with `board COLLATE "C" < cutoff` inside the daily: / weekly: prefix.
  // That is only correct if the keys sort chronologically as plain strings, so pin it
  // against an independent calendar oracle over several years of "now" values.
  it("daily keys older than 30 days sort below the cutoff, newer or equal ones do not", () => {
    for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2028, 0, 1); t += 7 * DAY_MS) {
      const now = new Date(t);
      const cutoff = retentionCutoffs(now).daily;
      for (let back = 0; back <= 45; back += 1) {
        const key = boardKey("daily", new Date(t - back * DAY_MS));
        expect(key < cutoff, `${key} vs ${cutoff} (now ${now.toISOString()})`).toBe(back > 30);
      }
    }
  });

  it("weekly keys from before the cutoff week sort below it, others do not", () => {
    for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2028, 0, 1); t += 7 * DAY_MS) {
      const now = new Date(t);
      const cutoff = retentionCutoffs(now).weekly;
      const cutoffDay = new Date(t - 84 * DAY_MS);
      // Monday 00:00Z of the cutoff day's week, computed without the code under test.
      const mondayOffset = (cutoffDay.getUTCDay() + 6) % 7;
      const monday = Date.UTC(
        cutoffDay.getUTCFullYear(),
        cutoffDay.getUTCMonth(),
        cutoffDay.getUTCDate() - mondayOffset,
      );
      for (let back = 0; back <= 140; back += 1) {
        const day = t - back * DAY_MS;
        const key = boardKey("weekly", new Date(day));
        const olderWeek = day < monday;
        expect(key < cutoff, `${key} vs ${cutoff} (now ${now.toISOString()})`).toBe(olderWeek);
      }
    }
  });
});
