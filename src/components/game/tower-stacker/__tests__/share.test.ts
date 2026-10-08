import { afterEach, describe, expect, it, vi } from "vitest";
import { shareResult, shareText } from "../share";

const RUN = { dayKey: "2026-10-15", floors: 34, score: 480, bestStreak: 5 };

function setNavigator(over: { share?: unknown; clipboard?: unknown }) {
  Object.defineProperty(navigator, "share", { value: over.share, configurable: true });
  Object.defineProperty(navigator, "clipboard", { value: over.clipboard, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
  vi.restoreAllMocks();
});

describe("shareText", () => {
  it("is the one-line result with the game's address", () => {
    expect(shareText(RUN)).toBe(
      "Tower Stacker, 2026-10-15: 34 floors, 480 points, best streak 5. https://amindhou.com/games/tower-stacker",
    );
  });

  it("uses the singular for one floor or one point", () => {
    expect(shareText({ ...RUN, floors: 1, score: 1 })).toContain("1 floor, 1 point,");
  });

  it("is plain ASCII", () => {
    const codes = [...shareText(RUN)].map((ch) => ch.charCodeAt(0));
    expect(codes.every((code) => code >= 0x20 && code <= 0x7e)).toBe(true);
  });
});

describe("shareResult", () => {
  it("uses the share sheet when there is one, and does not copy", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share, clipboard: { writeText } });
    await expect(shareResult("hello")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "hello" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("leaves a dismissed share sheet alone (no surprise copy)", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("closed", "AbortError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share, clipboard: { writeText } });
    await expect(shareResult("hello")).resolves.toBe("dismissed");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard without a share sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ clipboard: { writeText } });
    await expect(shareResult("hello")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to the clipboard when the share sheet breaks", async () => {
    const share = vi.fn().mockRejectedValue(new TypeError("no"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share, clipboard: { writeText } });
    await expect(shareResult("hello")).resolves.toBe("copied");
  });

  it("reports failure when nothing can copy", async () => {
    setNavigator({});
    await expect(shareResult("hello")).resolves.toBe("failed");
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    setNavigator({ clipboard: { writeText } });
    await expect(shareResult("hello")).resolves.toBe("failed");
  });
});
