import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { ACHIEVEMENT_TOTAL } from "../hub-stats";
import { DeviceStats } from "../device-stats";

const SEEDED: Record<string, string> = {
  "space-shooter-hs": "48210",
  "orbital-dodge-profile": JSON.stringify({
    totalRunsPlayed: 12,
    unlockedAchievements: ["first-death"],
  }),
  hextris_highscores: JSON.stringify([9100, 400]),
  "svf:progress": JSON.stringify({ currentLevel: 4, totalScore: 1200 }),
  "typing-high-score": "87",
  "knight:progress": JSON.stringify({
    v: 1,
    towers: { "narrow-path": { best: { "1": { score: 90, grade: 2, turns: 12 } } } },
  }),
  "knight:stats": JSON.stringify({ v: 1, bestDaily: { day: "2026-10-16", score: 1250 } }),
  "failover:stats": JSON.stringify({
    v: 1,
    bestSeconds: 342,
    bestScore: 8420,
    runs: 7,
    lastDailyDay: null,
  }),
};

const PRIVACY = "Read from this browser only. Nothing here is sent anywhere.";
const EMPTY_COPY = "Play any game and your bests on this device show up here.";

function seed(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
}

function chips() {
  return screen.getAllByTestId("stat-chip");
}

describe("DeviceStats", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("server-renders seven placeholder chips and touches no storage", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const html = renderToString(<DeviceStats />);
    expect(html).toContain('data-state="pending"');
    expect(html.match(/data-testid="stat-chip"/g)).toHaveLength(7);
    expect(html.match(/None yet/g)).toHaveLength(7);
    expect(html).toContain(PRIVACY);
    for (const slug of [
      "space-shooter",
      "hextris",
      "super-voltorb-flip",
      "typing-speed",
      "tower-stacker",
      "script-knight",
      "failover",
    ]) {
      expect(html).toContain(`href="/games/${slug}"`);
    }
    expect(getItem).not.toHaveBeenCalled();
  });

  it("shows the empty copy and seven placeholders on a fresh device", () => {
    render(<DeviceStats />);
    expect(screen.getByTestId("hub-device")).toHaveAttribute("data-state", "empty");
    expect(screen.getByTestId("hub-device-caption")).toHaveTextContent(EMPTY_COPY);
    expect(chips()).toHaveLength(7);
    for (const item of chips()) expect(item).toHaveTextContent("None yet");
  });

  it("shows seeded bests, labelled honestly", () => {
    seed(SEEDED);
    render(<DeviceStats />);
    expect(screen.getByTestId("hub-device")).toHaveAttribute("data-state", "populated");
    expect(screen.getByTestId("hub-device-caption")).toHaveTextContent(PRIVACY);
    const [orbital, hextris, voltorb, typing, , knight, failover] = chips();
    expect(orbital).toHaveTextContent("Orbital Dodge");
    expect(orbital).toHaveTextContent("Best on this device");
    expect(orbital).toHaveTextContent("48,210");
    expect(orbital).toHaveTextContent(`12 runs, 1/${ACHIEVEMENT_TOTAL} achievements`);
    expect(hextris).toHaveTextContent("9,100");
    expect(voltorb).toHaveTextContent("Saved progress");
    expect(voltorb).toHaveTextContent("Level 4");
    expect(voltorb).toHaveTextContent("1,200 coins");
    expect(voltorb?.textContent?.toLowerCase()).not.toContain("best level");
    expect(typing).toHaveTextContent("87");
    expect(knight).toHaveTextContent("Script Knight");
    expect(knight).toHaveTextContent("Floors cleared");
    expect(knight).toHaveTextContent("1 of 18");
    expect(knight).toHaveTextContent("Best daily 1,250");
    expect(failover).toHaveTextContent("Failover");
    expect(failover).toHaveTextContent("Best on this device");
    expect(failover).toHaveTextContent("8,420");
    expect(failover).toHaveTextContent("Survived 5:42");
  });

  it("treats corrupt values as nothing, without an error report", () => {
    const report = vi.spyOn(globalThis, "reportError");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    seed({
      "space-shooter-hs": "NaN",
      "orbital-dodge-profile": '{"totalRunsPlayed":"x"}',
      hextris_highscores: "{oops",
      "svf:progress": "null",
      "typing-high-score": "-4",
      "knight:progress": "{oops",
      "knight:stats": "null",
      "failover:stats": "{oops",
    });
    render(<DeviceStats />);
    expect(screen.getByTestId("hub-device")).toHaveAttribute("data-state", "empty");
    expect(report).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("re-renders the chips when another tab changes storage", () => {
    seed(SEEDED);
    render(<DeviceStats />);
    expect(chips()[3]).toHaveTextContent("87");
    act(() => {
      localStorage.setItem("typing-high-score", "123");
      window.dispatchEvent(new StorageEvent("storage", { key: "typing-high-score" }));
    });
    expect(chips()[3]).toHaveTextContent("123");
    expect(chips()[3]).not.toHaveTextContent("87");
  });

  it("hydrates the server placeholder without a mismatch, then shows the seeded chips", async () => {
    const html = renderToString(<DeviceStats />);
    expect(html).toContain('data-state="pending"');
    expect(html).not.toContain("48,210");
    seed(SEEDED);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <DeviceStats />);
    });
    const hydrationErrors = consoleError.mock.calls.filter((call) =>
      call.some((arg) => /hydrat|did not match|mismatch/i.test(String(arg))),
    );
    expect(hydrationErrors).toEqual([]);
    expect(container.querySelector('[data-testid="hub-device"]')).toHaveAttribute(
      "data-state",
      "populated",
    );
    expect(container).toHaveTextContent("48,210");
    expect(container).toHaveTextContent("9,100");
    act(() => root?.unmount());
    container.remove();
  });

  it("only reads: no write, remove or clear", () => {
    seed(SEEDED);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const clear = vi.spyOn(Storage.prototype, "clear");
    render(<DeviceStats />);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("never leaves a chip alone on a row: a lone last chip spans two columns, then three from sm", () => {
    const html = renderToString(<DeviceStats />)
      .replaceAll("&amp;", "&")
      .replaceAll("&gt;", ">");
    expect(html).toContain("sm:grid-cols-3");
    // Each rule holds only at its own width, so the two can never both match one chip.
    expect(html).toContain("max-sm:[&>*:last-child:nth-child(odd)]:col-span-2");
    expect(html).toContain("sm:[&>*:nth-child(3n+1):last-child]:col-span-3");
    expect(html).not.toContain("col-span-1");
    expect(html).not.toContain("lg:grid-cols");
  });

  it("is an h2 followed by seven game links of at least 44px, in order", () => {
    seed(SEEDED);
    render(<DeviceStats />);
    expect(screen.getByRole("heading", { level: 2, name: "On this device" })).toBeInTheDocument();
    const section = screen.getByTestId("hub-device");
    const links = within(section).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/games/space-shooter",
      "/games/hextris",
      "/games/super-voltorb-flip",
      "/games/typing-speed",
      "/games/tower-stacker",
      "/games/script-knight",
      "/games/failover",
    ]);
    for (const link of links) {
      expect(link.className).toContain("min-h-11");
      expect(link.className).toContain("h-36");
    }
  });
});
