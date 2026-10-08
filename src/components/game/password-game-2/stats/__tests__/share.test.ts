import { describe, expect, it, vi } from "vitest";
import { buildShareText, shareResult } from "../share";

const base = { day: "2026-10-08", ms: 754_000, streak: 3, daily: true, biggestCrisis: "Garden" };

describe("buildShareText", () => {
  it("builds a spoiler-free line without the password or rule text", () => {
    const t = buildShareText(base, "https://example.test/games/password-game");
    expect(t).toContain("Password Game 2");
    expect(t).toContain("2026-10-08");
    expect(t).toContain("12:34");
    expect(t).toContain("3-day streak");
    expect(t).toContain("https://example.test/games/password-game");
    expect(t).not.toMatch(/[^\x20-\x7e\n]/); // ASCII only
  });

  it("omits the streak line below two days and the day for non-daily runs", () => {
    const t = buildShareText({ ...base, streak: 1, daily: false }, "https://x.test");
    expect(t).not.toContain("streak");
    expect(t).not.toContain("2026-10-08");
  });
});

describe("shareResult", () => {
  it("uses navigator.share when present, else the clipboard, else reports failure", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { share });
    expect(await shareResult("hi")).toBe("shared");
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => {}) } });
    expect(await shareResult("hi")).toBe("copied");
    vi.stubGlobal("navigator", {});
    expect(await shareResult("hi")).toBe("unavailable");
    vi.unstubAllGlobals();
  });

  it("treats a cancelled share sheet as a quiet no-op, not an error", async () => {
    vi.stubGlobal("navigator", {
      share: vi.fn(async () => {
        throw new DOMException("x", "AbortError");
      }),
    });
    expect(await shareResult("hi")).toBe("cancelled");
    vi.unstubAllGlobals();
  });

  it("falls back to the clipboard when the share call fails for another reason", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", {
      share: vi.fn(async () => {
        throw new Error("nope");
      }),
      clipboard: { writeText },
    });
    expect(await shareResult("hi")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("hi");
    vi.unstubAllGlobals();
  });
});
