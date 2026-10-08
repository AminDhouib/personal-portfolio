import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createRun } from "../../engine/engine";
import { ReceiptCard } from "../receipt-card";

describe("ReceiptCard date", () => {
  // CI runs under UTC; pin a zone behind UTC so the local and UTC days differ.
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Toronto";
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("prints the UTC day, not the local one (a 21:00 run at UTC-5 is already the next UTC day)", () => {
    // 2026-10-09T02:00Z is 22:00 on the 8th in Toronto.
    vi.setSystemTime(new Date("2026-10-09T02:00:00Z"));
    const g = createRun({ seed: 7, daily: true, nowHHMM: () => "12:00" });
    const { container } = render(
      <ReceiptCard
        g={g}
        seed={7}
        daily
        onCopySeed={() => {}}
        onPlayAgain={() => {}}
        onPlayDaily={() => {}}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("2026-10-09");
    expect(text).not.toContain("2026-10-08");
  });
});

describe("ReceiptCard share", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers a 44px Share button that hands an ASCII, spoiler-free line to navigator.share", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { share });
    const g = createRun({ seed: 7, daily: true, nowHHMM: () => "12:00" });
    g.stats.biggestCrisis = "gerald";
    const { getByRole } = render(
      <ReceiptCard
        g={g}
        seed={7}
        daily
        onCopySeed={() => {}}
        onPlayAgain={() => {}}
        onPlayDaily={() => {}}
      />,
    );
    const btn = getByRole("button", { name: /share/i });
    expect(btn.className).toContain("min-h-11");
    fireEvent.click(btn);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const arg = (share.mock.calls[0] as unknown as [{ text: string }])[0];
    expect(arg.text).toContain("Password Game 2");
    expect(arg.text).not.toMatch(/[^\x20-\x7e\n]/);
  });

  it("shares the PNG card with the text when the browser can share files", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { share, canShare: () => true });
    const fakeCtx = new Proxy({}, { get: () => () => ({ width: 10 }), set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() => fakeCtx) as unknown as HTMLCanvasElement["getContext"],
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) =>
      cb(new Blob(["png"], { type: "image/png" })),
    );
    const g = createRun({ seed: 7, daily: true, nowHHMM: () => "12:00" });
    const { getByRole } = render(
      <ReceiptCard
        g={g}
        seed={7}
        daily
        onCopySeed={() => {}}
        onPlayAgain={() => {}}
        onPlayDaily={() => {}}
      />,
    );
    fireEvent.click(getByRole("button", { name: /share/i }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const arg = (share.mock.calls[0] as unknown as [{ files: File[]; text: string }])[0];
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0]!.type).toBe("image/png");
    expect(arg.text).toContain("Password Game 2");
    vi.restoreAllMocks();
  });
});
