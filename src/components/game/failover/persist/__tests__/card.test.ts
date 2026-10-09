import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARD_FILE, CARD_WATERMARK, cardBlob, composeCard, downloadCard, shareCard } from "../card";

// The share card: the board's frame with a band under it naming the run and
// carrying the site's address, as a PNG to download or hand to the OS share
// sheet. jsdom has no 2D canvas, so a recording context stands in for one.

interface Call {
  fn: string;
  args: unknown[];
}

let calls: Call[] = [];

function fakeContext() {
  const record =
    (fn: string) =>
    (...args: unknown[]) => {
      calls.push({ fn, args });
    };
  return {
    fillStyle: "",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    fillRect: record("fillRect"),
    drawImage: record("drawImage"),
    fillText: record("fillText"),
  };
}

beforeEach(() => {
  calls = [];
  // getContext is overloaded per context kind; the fake only ever stands in for "2d".
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() =>
    fakeContext()) as unknown as HTMLCanvasElement["getContext"]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function shot(width = 800, height = 450): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

const texts = () => calls.filter((c) => c.fn === "fillText").map((c) => c.args[0]);

describe("composeCard", () => {
  it("draws the frame on top and a band under it with the run and the address", () => {
    const frame = shot();
    const card = composeCard(frame, { mode: "survival", seconds: 222, score: 8420, services: 12 });
    expect(card).not.toBeNull();
    expect(card!.width).toBe(800);
    expect(card!.height).toBeGreaterThan(450);
    expect(calls.find((c) => c.fn === "drawImage")?.args).toEqual([frame, 0, 0]);
    expect(texts()).toEqual(["Failover", "Survival: 3:42, score 8,420", CARD_WATERMARK]);
    expect(CARD_WATERMARK).toBe("amindhou.com/games/failover");
  });

  it("names a Sandbox build by its size, with no score", () => {
    composeCard(shot(), { mode: "sandbox", seconds: 90, score: 0, services: 7 });
    expect(texts()).toEqual(["Failover", "Sandbox build: 7 services", CARD_WATERMARK]);
  });

  it("gives up on an empty frame or a browser with no 2D canvas", () => {
    expect(
      composeCard(shot(0, 0), { mode: "sandbox", seconds: 0, score: 0, services: 0 }),
    ).toBeNull();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    expect(composeCard(shot(), { mode: "sandbox", seconds: 0, score: 0, services: 0 })).toBeNull();
  });
});

describe("cardBlob", () => {
  it("encodes a PNG, or null when the browser cannot", async () => {
    const png = new Blob(["png"], { type: "image/png" });
    const canvas = shot();
    const toBlob = vi.spyOn(canvas, "toBlob").mockImplementation((cb: BlobCallback) => cb(png));
    await expect(cardBlob(canvas)).resolves.toBe(png);
    expect(toBlob.mock.calls[0]?.[1]).toBe("image/png");
    toBlob.mockImplementation((cb: BlobCallback) => cb(null));
    await expect(cardBlob(canvas)).resolves.toBeNull();
  });
});

describe("delivering the card", () => {
  const png = new Blob(["png"], { type: "image/png" });

  it("downloads it under its file name and lets the object URL go", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:card");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe(CARD_FILE);
      expect(this.getAttribute("href")).toBe("blob:card");
    });
    downloadCard(png);
    expect(click).toHaveBeenCalledTimes(1);
    expect(CARD_FILE).toBe("failover-build.png");
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:card");
    vi.useRealTimers();
  });

  it("hands it to the share sheet as a file, and tells a cancel from a failure", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, share, canShare });
    await expect(shareCard(png)).resolves.toBe("shared");
    const data = share.mock.calls[0]?.[0] as ShareData;
    expect(data.files?.[0]?.name).toBe(CARD_FILE);
    expect(data.files?.[0]?.type).toBe("image/png");

    share.mockRejectedValue(new DOMException("closed", "AbortError"));
    await expect(shareCard(png)).resolves.toBe("cancelled");
    share.mockRejectedValue(new DOMException("nope", "NotAllowedError"));
    await expect(shareCard(png)).resolves.toBe("failed");
  });

  it("says when the browser cannot share files at all", async () => {
    vi.stubGlobal("navigator", { ...navigator, share: undefined, canShare: undefined });
    await expect(shareCard(png)).resolves.toBe("unsupported");
    vi.stubGlobal("navigator", { ...navigator, share: vi.fn(), canShare: () => false });
    await expect(shareCard(png)).resolves.toBe("unsupported");
  });
});
