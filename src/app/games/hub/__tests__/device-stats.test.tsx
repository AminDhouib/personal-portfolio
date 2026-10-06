import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("server-renders four placeholder chips and touches no storage", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const html = renderToString(<DeviceStats />);
    expect(html).toContain('data-state="pending"');
    expect(html.match(/data-testid="stat-chip"/g)).toHaveLength(4);
    expect(html.match(/None yet/g)).toHaveLength(4);
    expect(html).toContain(PRIVACY);
    for (const slug of ["space-shooter", "hextris", "super-voltorb-flip", "typing-speed"]) {
      expect(html).toContain(`href="/games/${slug}"`);
    }
    expect(getItem).not.toHaveBeenCalled();
  });

  it("shows the empty copy and four placeholders on a fresh device", () => {
    render(<DeviceStats />);
    expect(screen.getByTestId("hub-device")).toHaveAttribute("data-state", "empty");
    expect(screen.getByTestId("hub-device-caption")).toHaveTextContent(EMPTY_COPY);
    expect(chips()).toHaveLength(4);
    for (const item of chips()) expect(item).toHaveTextContent("None yet");
  });

  it("shows seeded bests, labelled honestly", () => {
    seed(SEEDED);
    render(<DeviceStats />);
    expect(screen.getByTestId("hub-device")).toHaveAttribute("data-state", "populated");
    expect(screen.getByTestId("hub-device-caption")).toHaveTextContent(PRIVACY);
    const [orbital, hextris, voltorb, typing] = chips();
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
    });
    render(<DeviceStats />);
    expect(screen.getByTestId("hub-device")).toHaveAttribute("data-state", "empty");
    expect(report).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
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

  it("is an h2 followed by four game links of at least 44px, in order", () => {
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
    ]);
    for (const link of links) {
      expect(link.className).toContain("min-h-11");
      expect(link.className).toContain("h-36");
    }
  });
});
