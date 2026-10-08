import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUB_STAT_KEYS } from "@/app/games/hub/hub-stats";
import { safeLocalSet } from "@/lib/safe-storage";
import { TIPS_KEY, markPanicTipSeen, readTips } from "../tips";

vi.mock("@/lib/safe-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/safe-storage")>();
  return { ...actual, safeLocalSet: vi.fn(actual.safeLocalSet) };
});

// Pins the stored shape of the one-time tips. Changing it later without a migration would show
// a player the Panic Clear tip again.

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hextris tips storage", () => {
  it("uses its own key", () => {
    expect(TIPS_KEY).toBe("hextris_tips");
  });

  it("reads an absent key as not yet seen", () => {
    expect(readTips()).toEqual({ panicSeen: false });
  });

  it("reads corrupt JSON as not yet seen, without throwing", () => {
    window.localStorage.setItem(TIPS_KEY, "{not json");
    expect(() => readTips()).not.toThrow();
    expect(readTips()).toEqual({ panicSeen: false });
  });

  it("reads an unknown version or a bad field as not yet seen", () => {
    window.localStorage.setItem(TIPS_KEY, JSON.stringify({ v: 2, panicSeen: true }));
    expect(readTips()).toEqual({ panicSeen: false });
    window.localStorage.setItem(TIPS_KEY, JSON.stringify({ v: 1, panicSeen: "yes" }));
    expect(readTips()).toEqual({ panicSeen: false });
  });

  it("writes exactly this JSON through safeLocalSet (the pinned stored shape)", () => {
    markPanicTipSeen();
    expect(safeLocalSet).toHaveBeenCalledWith(TIPS_KEY, '{"v":1,"panicSeen":true}');
    expect(window.localStorage.getItem(TIPS_KEY)).toBe('{"v":1,"panicSeen":true}');
    expect(readTips()).toEqual({ panicSeen: true });
  });

  it("reads blocked storage as not yet seen", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readTips()).toEqual({ panicSeen: false });
  });

  it("is never read by the games hub", () => {
    expect(HUB_STAT_KEYS as readonly string[]).not.toContain(TIPS_KEY);
  });
});
