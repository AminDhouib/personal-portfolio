import { describe, it, expect, beforeEach, vi } from "vitest";

// nextGameCrash keeps a module-level Set of games that already reported a
// crash this session; each test needs a fresh module instance so an earlier
// test's dedupe state cannot leak into a later one (log.test.ts uses the
// same vi.resetModules + dynamic import pattern for its module-level state).
describe("nextGameCrash", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns an Error naming the game with the original error as cause, on first call", async () => {
    const { nextGameCrash } = await import("../report-game-error");
    const original = new Error("boom");
    const result = nextGameCrash("hextris", original);
    expect(result).toBeInstanceOf(Error);
    expect(result?.message).toContain("hextris");
    expect(result?.cause).toBe(original);
  });

  it("returns null on a second call for the same game (flood guard)", async () => {
    const { nextGameCrash } = await import("../report-game-error");
    nextGameCrash("hextris", new Error("first"));
    const second = nextGameCrash("hextris", new Error("second"));
    expect(second).toBeNull();
  });

  it("tracks different games independently", async () => {
    const { nextGameCrash } = await import("../report-game-error");
    const a = nextGameCrash("hextris", new Error("a"));
    const b = nextGameCrash("space-shooter", new Error("b"));
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
  });

  it("wraps a non-Error input as the cause", async () => {
    const { nextGameCrash } = await import("../report-game-error");
    const result = nextGameCrash("hextris", "raw string throw");
    if (!result) throw new Error("expected nextGameCrash to return an Error");
    expect(result.cause).toBeInstanceOf(Error);
    expect((result.cause as Error).message).toBe("raw string throw");
  });
});
