import { afterEach, describe, it, expect, vi } from "vitest";
import { shareRun, shareText } from "../share";

afterEach(() => {
  vi.restoreAllMocks();
});

const file = new File(["x"], "orbital-dodge.png", { type: "image/png" });

describe("shareText", () => {
  it("carries the score and the game link", () => {
    expect(shareText(4200)).toBe(
      "I scored 4200 in Orbital Dodge. Beat it: https://amindhou.com/games/space-shooter",
    );
  });
});

describe("shareRun", () => {
  it("uses the native file share with the text when the browser supports it", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    const download = vi.fn();
    const out = await shareRun({
      score: 10,
      file,
      nav: { canShare: () => true, share, clipboard: { writeText } },
      download,
    });
    expect(out).toEqual({ shared: true, copied: false, downloaded: false });
    expect(share).toHaveBeenCalledWith({
      title: "Orbital Dodge",
      text: shareText(10),
      files: [file],
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("copies the text, then downloads the image, when file share is unsupported", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const download = vi.fn();
    const out = await shareRun({
      score: 10,
      file,
      nav: { clipboard: { writeText } },
      download,
    });
    expect(writeText).toHaveBeenCalledWith(shareText(10));
    expect(download).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ shared: false, copied: true, downloaded: true });
  });

  it("still downloads when the clipboard is missing or rejects", async () => {
    const download = vi.fn();
    const none = await shareRun({ score: 1, file, nav: {}, download });
    expect(none).toEqual({ shared: false, copied: false, downloaded: true });
    const rejecting = await shareRun({
      score: 1,
      file,
      nav: { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } },
      download,
    });
    expect(rejecting).toEqual({ shared: false, copied: false, downloaded: true });
  });

  it("falls through to the copy and download when the native share is cancelled", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const download = vi.fn();
    const out = await shareRun({
      score: 5,
      file,
      nav: {
        canShare: () => true,
        share: vi.fn().mockRejectedValue(new Error("AbortError")),
        clipboard: { writeText },
      },
      download,
    });
    expect(out).toEqual({ shared: false, copied: true, downloaded: true });
  });
});
