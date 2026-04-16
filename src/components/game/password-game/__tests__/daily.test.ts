import { describe, it, expect } from "vitest";
import { dailySeed, todayDateString } from "../daily";

describe("dailySeed", () => {
  it("produces the same seed for the same date string", () => {
    expect(dailySeed("2026-04-15")).toBe(dailySeed("2026-04-15"));
  });

  it("produces different seeds for different dates", () => {
    expect(dailySeed("2026-04-15")).not.toBe(dailySeed("2026-04-16"));
    expect(dailySeed("2026-01-01")).not.toBe(dailySeed("2026-12-31"));
  });

  it("returns a non-negative 32-bit integer", () => {
    const s = dailySeed("2026-04-15");
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("todayDateString", () => {
  it("returns a UTC YYYY-MM-DD string", () => {
    const str = todayDateString();
    expect(str).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("accepts an optional date argument", () => {
    expect(todayDateString(new Date("2026-04-15T00:00:00Z"))).toBe("2026-04-15");
    expect(todayDateString(new Date("2026-04-15T23:59:59Z"))).toBe("2026-04-15");
  });
});
