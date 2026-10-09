// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { dailyShareText, shareDaily } from "../share-text";

afterEach(() => vi.unstubAllGlobals());

describe("dailyShareText", () => {
  it("is the one line the plan names", () => {
    expect(dailyShareText({ day: "2026-10-09", seconds: 342, score: 8420 })).toBe(
      "Failover daily 2026-10-09: 5:42, 8420. amindhou.com/games/failover",
    );
  });

  it("writes seconds as m:ss and is ASCII only", () => {
    const text = dailyShareText({ day: "2026-10-09", seconds: 900, score: 224349 });
    expect(text).toBe("Failover daily 2026-10-09: 15:00, 224349. amindhou.com/games/failover");
    expect([...text].every((c) => c >= " " && c <= "~")).toBe(true);
  });
});

describe("shareDaily", () => {
  it("opens the share sheet when there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    expect(await shareDaily("hi")).toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "hi" });
  });

  it("leaves a dismissed sheet alone, with no copy", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(new DOMException("no", "AbortError")),
      clipboard: { writeText },
    });
    expect(await shareDaily("hi")).toBe("dismissed");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies when there is no sheet, or the sheet broke", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await shareDaily("hi")).toBe("copied");
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(new Error("boom")),
      clipboard: { writeText },
    });
    expect(await shareDaily("again")).toBe("copied");
    expect(writeText).toHaveBeenLastCalledWith("again");
  });

  it("says failed when nothing can copy", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("refused")) },
    });
    expect(await shareDaily("hi")).toBe("failed");
  });
});
