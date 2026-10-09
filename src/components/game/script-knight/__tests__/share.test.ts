import { afterEach, describe, expect, it, vi } from "vitest";
import { replayUrl, shareResult, shareText } from "../share";

function setNavigator(over: { share?: unknown; clipboard?: unknown }) {
  Object.defineProperty(navigator, "share", { value: over.share, configurable: true });
  Object.defineProperty(navigator, "clipboard", { value: over.clipboard, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
  vi.restoreAllMocks();
});

const LINK = "https://amindhou.com/games/script-knight#replay=1.d.20261015.w-";

describe("replayUrl", () => {
  it("puts the fragment on the game's address", () => {
    expect(replayUrl("#replay=1.d.20261015.w-")).toBe(LINK);
  });
});

describe("shareText", () => {
  it("is the daily result with its par, then the link", () => {
    expect(shareText({ title: "2026-10-15", score: 112, turns: 23, par: 98, link: LINK })).toBe(
      `Script Knight, 2026-10-15: 112 points in 23 turns (par 98) ${LINK}`,
    );
  });

  it("leaves the par out for a floor that has none", () => {
    expect(
      shareText({ title: "The Narrow Path, floor 3", score: 66, turns: 28, par: null, link: LINK }),
    ).toBe(`Script Knight, The Narrow Path, floor 3: 66 points in 28 turns ${LINK}`);
  });

  it("uses the singular for one point or one turn", () => {
    expect(shareText({ title: "x", score: 1, turns: 1, par: null, link: LINK })).toContain(
      "1 point in 1 turn ",
    );
  });

  it("is plain ASCII", () => {
    const text = shareText({ title: "2026-10-15", score: 112, turns: 23, par: 98, link: LINK });
    expect([...text].every((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) <= 0x7e)).toBe(
      true,
    );
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

  it("reports failure when there is no way to copy", async () => {
    setNavigator({});
    await expect(shareResult("hello")).resolves.toBe("failed");
  });
});
