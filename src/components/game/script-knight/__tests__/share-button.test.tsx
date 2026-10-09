import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeLog } from "../engine/codec";
import type { LevelRef } from "../engine/level-ref";
import { parseReplayFragment } from "../replay-link";
import { ShareRunButton } from "../share-button";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
  vi.restoreAllMocks();
});

const DAILY: LevelRef = { kind: "daily", day: "2026-10-15" };
const LOG = "1:w-w-h0";
const ORIGIN_LINK = "/games/script-knight#replay=1.d.20261015.w-w-h0";

function setClipboard(writeText: unknown) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("ShareRunButton", () => {
  it("copies the result line and the replay link when there is no share sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(
      <ShareRunButton floor={DAILY} log={LOG} title="2026-10-15" score={112} turns={3} par={98} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Share this run" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = String(writeText.mock.calls[0]![0]);
    expect(
      text.startsWith("Script Knight, 2026-10-15: 112 points in 3 turns (par 98) https://"),
    ).toBe(true);
    expect(text.endsWith(ORIGIN_LINK)).toBe(true);
    expect(await screen.findByText("Copied to the clipboard.")).toBeTruthy();
  });

  it("uses the share sheet when there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    render(<ShareRunButton floor={DAILY} log={LOG} title="x" score={1} turns={1} par={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Share this run" }));
    expect(await screen.findByText("Shared.")).toBeTruthy();
    expect(String(share.mock.calls[0]![0].text)).toContain("1 point in 1 turn ");
  });

  it("says so when it could not copy, and says nothing when the sheet was dismissed", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("no")));
    render(<ShareRunButton floor={DAILY} log={LOG} title="x" score={1} turns={1} par={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Share this run" }));
    expect(await screen.findByText("Could not copy.")).toBeTruthy();

    const share = vi.fn().mockRejectedValue(new DOMException("closed", "AbortError"));
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: "Share this run" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(""));
  });

  it("fits the longest run the codec holds under the link cap", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    const long = encodeLog(Array.from({ length: 200 }, () => ({ name: "walk", direction: null })));
    render(<ShareRunButton floor={DAILY} log={long} title="x" score={1} turns={200} par={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Share this run" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = String(writeText.mock.calls[0]![0]);
    expect(parseReplayFragment(text.slice(text.indexOf("#")))?.actions).toHaveLength(200);
  });

  it("does not offer a link for a log it cannot read", () => {
    render(<ShareRunButton floor={DAILY} log="1:zz" title="x" score={1} turns={1} par={null} />);
    expect(screen.queryByRole("button", { name: "Share this run" })).toBeNull();
  });
});
