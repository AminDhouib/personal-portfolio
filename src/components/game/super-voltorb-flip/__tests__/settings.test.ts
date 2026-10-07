import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
  parseSettings,
  saveSettings,
} from "../settings";

// Pins the stored shape of the settings. Changing it later without a
// migration would silently reset players' choices.

beforeEach(() => {
  window.localStorage.clear();
});

describe("settings storage", () => {
  it("uses its own key, never the progress or mute keys", () => {
    expect(SETTINGS_KEY).toBe("svf:settings");
    expect(SETTINGS_KEY).not.toBe("svf:progress");
    expect(SETTINGS_KEY).not.toBe("svf:muted");
  });

  it("defaults: memo undo on, statistics on, assist off", () => {
    expect(DEFAULT_SETTINGS).toEqual({ memoUndo: true, stats: true, assist: false });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("writes exactly this JSON (the pinned stored shape)", () => {
    saveSettings({ memoUndo: false, stats: true, assist: true });
    expect(window.localStorage.getItem("svf:settings")).toBe(
      '{"v":1,"memoUndo":false,"stats":true,"assist":true}',
    );
  });

  it("round-trips", () => {
    saveSettings({ memoUndo: false, stats: false, assist: true });
    expect(loadSettings()).toEqual({ memoUndo: false, stats: false, assist: true });
  });

  it("never touches the progress or mute keys", () => {
    window.localStorage.setItem("svf:progress", "P");
    window.localStorage.setItem("svf:muted", "1");
    saveSettings({ memoUndo: false, stats: true, assist: false });
    loadSettings();
    expect(window.localStorage.getItem("svf:progress")).toBe("P");
    expect(window.localStorage.getItem("svf:muted")).toBe("1");
  });

  it("falls back to the defaults for anything that is not a v1 object", () => {
    for (const raw of [null, 7, "x", [], { v: 2, memoUndo: false }, { memoUndo: false }]) {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("keeps the good fields and defaults the bad ones", () => {
    expect(parseSettings({ v: 1, memoUndo: false, stats: "yes", assist: 1 })).toEqual({
      memoUndo: false,
      stats: true,
      assist: false,
    });
    expect(parseSettings({ v: 1 })).toEqual(DEFAULT_SETTINGS);
  });

  it("corrupting one field resets only that field", () => {
    const good = { v: 1, memoUndo: false, stats: false, assist: true };
    const expected = { memoUndo: false, stats: false, assist: true };
    for (const key of ["memoUndo", "stats", "assist"] as const) {
      const parsed = parseSettings({ ...good, [key]: "corrupt" });
      expect(parsed).toEqual({ ...expected, [key]: DEFAULT_SETTINGS[key] });
    }
  });

  it("does not write over a value stored by a newer version", () => {
    const newer = '{"v":2,"memoUndo":false,"stats":false,"assist":true,"extra":1}';
    window.localStorage.setItem("svf:settings", newer);
    saveSettings({ memoUndo: true, stats: true, assist: false });
    expect(window.localStorage.getItem("svf:settings")).toBe(newer);
  });

  it("still overwrites its own and unreadable values", () => {
    window.localStorage.setItem("svf:settings", "{not json");
    saveSettings({ memoUndo: false, stats: true, assist: false });
    expect(loadSettings().memoUndo).toBe(false);
  });

  it("survives unreadable text and blocked storage", () => {
    window.localStorage.setItem("svf:settings", "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    spy.mockRestore();
  });
});
