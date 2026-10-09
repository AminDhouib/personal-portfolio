import { afterEach, describe, expect, it, vi } from "vitest";
import { HEXTRIS_URL, shareRun, shareText } from "../share";

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
  it("is the score line", () => {
    expect(shareText(1200)).toBe("I scored 1200 in Hextris");
  });

  it("links to the game", () => {
    expect(HEXTRIS_URL).toBe("https://amindhou.com/games/hextris");
  });
});

describe("shareRun", () => {
  it("uses the share sheet with a title, the text and the link, and does not copy", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share, clipboard: { writeText } });
    await expect(shareRun(1200)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "Hextris",
      text: "I scored 1200 in Hextris",
      url: "https://amindhou.com/games/hextris",
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the line and the link without a share sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ clipboard: { writeText } });
    await expect(shareRun(1200)).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(
      "I scored 1200 in Hextris https://amindhou.com/games/hextris",
    );
  });

  it("leaves a dismissed share sheet alone (no surprise copy)", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("closed", "AbortError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share, clipboard: { writeText } });
    await expect(shareRun(1200)).resolves.toBe("dismissed");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("treats a share already in progress as dismissed, not as a reason to copy", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("busy", "InvalidStateError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share, clipboard: { writeText } });
    await expect(shareRun(1200)).resolves.toBe("dismissed");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard when the share sheet breaks", async () => {
    const share = vi.fn().mockRejectedValue(new TypeError("no"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share, clipboard: { writeText } });
    await expect(shareRun(1200)).resolves.toBe("copied");
  });

  it("reports failure when nothing can copy", async () => {
    setNavigator({});
    await expect(shareRun(1200)).resolves.toBe("failed");
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    setNavigator({ clipboard: { writeText } });
    await expect(shareRun(1200)).resolves.toBe("failed");
  });
});
