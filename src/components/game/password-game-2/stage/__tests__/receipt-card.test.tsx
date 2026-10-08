import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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
        startDay="2026-10-09"
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
        startDay="2026-10-09"
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

  function mountDaily() {
    const g = createRun({ seed: 7, daily: true, nowHHMM: () => "12:00" });
    return render(
      <ReceiptCard
        g={g}
        seed={7}
        daily
        startDay="2026-10-09"
        onCopySeed={() => {}}
        onPlayAgain={() => {}}
        onPlayDaily={() => {}}
      />,
    );
  }

  function fakeCanvas(toBlob: (cb: BlobCallback) => void) {
    const fakeCtx = new Proxy({}, { get: () => () => ({ width: 10 }), set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() => fakeCtx) as unknown as HTMLCanvasElement["getContext"],
    );
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((cb) => toBlob(cb));
    return spy;
  }

  it("pre-renders the PNG so the click calls navigator.share synchronously with the file", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { share, canShare: () => true });
    const toBlob = fakeCanvas((cb) => cb(new Blob(["png"], { type: "image/png" })));
    const { getByRole } = mountDaily();
    await waitFor(() => expect(toBlob).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.click(getByRole("button", { name: /share/i }));
    // No await between the click and the assertion: the call is inside the gesture.
    expect(share).toHaveBeenCalledTimes(1);
    const arg = (share.mock.calls[0] as unknown as [{ files: File[]; text: string }])[0];
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0]!.type).toBe("image/png");
    expect(arg.text).toContain("Password Game 2");
    vi.restoreAllMocks();
  });

  it("shares the text synchronously when the PNG is not ready yet", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { share, canShare: () => true });
    const toBlob = fakeCanvas(() => {});
    const { getByRole } = mountDaily();
    await waitFor(() => expect(toBlob).toHaveBeenCalled());
    fireEvent.click(getByRole("button", { name: /share/i }));
    expect(share).toHaveBeenCalledTimes(1);
    const arg = (share.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(arg["files"]).toBeUndefined();
    expect(String(arg["text"])).toContain("Password Game 2");
    vi.restoreAllMocks();
  });

  it("survives a canvas that throws and still shares the text", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { share, canShare: () => true });
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => {
        throw new Error("no canvas");
      });
    const { getByRole } = mountDaily();
    await waitFor(() => expect(getContext).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.click(getByRole("button", { name: /share/i }));
    expect(share).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("ignores a second tap while a share is in flight", async () => {
    const share = vi.fn(() => new Promise<void>(() => {}));
    vi.stubGlobal("navigator", { share });
    const { getByRole } = mountDaily();
    const btn = getByRole("button", { name: /share/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(share).toHaveBeenCalledTimes(1);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("writes to the clipboard inside the click when there is no share sheet", () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { getByRole } = mountDaily();
    fireEvent.click(getByRole("button", { name: /share/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});
