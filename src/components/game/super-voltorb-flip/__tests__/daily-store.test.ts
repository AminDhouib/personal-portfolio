import { describe, it, expect, beforeEach } from "vitest";
import { DAILY_KEY, freshDaily, loadDaily, parseDaily, saveDaily } from "../daily-store";

beforeEach(() => {
  window.localStorage.clear();
});

describe("daily storage", () => {
  it("has its own key", () => {
    expect(DAILY_KEY).toBe("svf:daily");
  });

  it("starts a fresh record with the pinned shape", () => {
    expect(freshDaily("2026-10-07", "Ada")).toEqual({
      handle: "Ada",
      day: "2026-10-07",
      flips: [],
      outcome: null,
      submitted: false,
    });
  });

  it("writes exactly this JSON (the pinned stored shape)", () => {
    saveDaily({
      handle: "Ada",
      day: "2026-10-07",
      flips: [12, 0, 7],
      outcome: "quit",
      submitted: true,
    });
    expect(window.localStorage.getItem("svf:daily")).toBe(
      '{"v":1,"handle":"Ada","day":"2026-10-07","flips":[12,0,7],"outcome":"quit","submitted":true}',
    );
  });

  it("round-trips", () => {
    const round = freshDaily("2026-10-07", "");
    const played = { ...round, flips: [3, 4], outcome: "lost" as const };
    saveDaily(played);
    expect(loadDaily()).toEqual(played);
  });

  it("is null when nothing is stored, or the text is unreadable", () => {
    expect(loadDaily()).toBeNull();
    window.localStorage.setItem("svf:daily", "{nope");
    expect(loadDaily()).toBeNull();
  });

  it("rejects records it cannot trust", () => {
    const ok = {
      v: 1,
      handle: "Ada",
      day: "2026-10-07",
      flips: [1, 2],
      outcome: null,
      submitted: false,
    };
    expect(parseDaily(ok)).not.toBeNull();
    for (const bad of [
      { ...ok, v: 2 },
      { ...ok, day: "yesterday" },
      { ...ok, day: "2026-02-30" },
      { ...ok, flips: [1, 1] }, // a tile cannot be flipped twice
      { ...ok, flips: [25] },
      { ...ok, flips: [-1] },
      { ...ok, flips: [1.5] },
      { ...ok, flips: Array.from({ length: 26 }, (_, i) => i) },
      { ...ok, outcome: "tied" },
      { ...ok, submitted: "yes" },
      null,
      "x",
      [],
    ]) {
      expect(parseDaily(bad)).toBeNull();
    }
  });

  it("repairs the handle: trimmed, at most 12 characters, text only", () => {
    const base = { v: 1, day: "2026-10-07", flips: [], outcome: null, submitted: false };
    expect(parseDaily({ ...base, handle: "  Ada  " })?.handle).toBe("Ada");
    expect(parseDaily({ ...base, handle: "A".repeat(40) })?.handle).toBe("A".repeat(12));
    expect(parseDaily({ ...base, handle: 7 })?.handle).toBe("");
  });

  it("does not overwrite a record a newer build wrote", () => {
    const newer = '{"v":2,"day":"2026-10-07","flips":[1],"anything":"new"}';
    window.localStorage.setItem("svf:daily", newer);
    saveDaily(freshDaily("2026-10-07", "Ada"));
    expect(window.localStorage.getItem("svf:daily")).toBe(newer);
  });

  it("never touches progress, mute, settings or statistics", () => {
    for (const k of ["svf:progress", "svf:muted", "svf:settings", "svf:stats"]) {
      window.localStorage.setItem(k, "keep");
    }
    saveDaily(freshDaily("2026-10-07", ""));
    loadDaily();
    for (const k of ["svf:progress", "svf:muted", "svf:settings", "svf:stats"]) {
      expect(window.localStorage.getItem(k)).toBe("keep");
    }
  });
});
