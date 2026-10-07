import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, act } from "@testing-library/react";

vi.mock("next/font/local", () => ({
  default: () => ({ className: "mock-font", style: { fontFamily: "mock" } }),
}));

const audio = vi.hoisted(() => ({ playMusic: vi.fn() }));

vi.mock("../audio", () => ({
  sfx: new Proxy({}, { get: () => () => Promise.resolve() }),
  playMusic: audio.playMusic,
  stopMusic: () => {},
  fadeOutMusic: () => {},
  playGameOver: () => {},
  stopGameOver: () => {},
  playLevelWin: () => {},
  stopLevelWin: () => {},
  stopAllCues: () => {},
  setMusicMuted: () => {},
}));

vi.mock("../effects/context", () => ({
  EffectsProvider: ({ children }: { children: ReactNode }) => children,
  useEffectsTheme: () => null,
}));

import { SuperVoltorbFlipGame } from "../../super-voltorb-flip";

let readyState: DocumentReadyState = "loading";

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  audio.playMusic.mockClear();
  readyState = "loading";
  Object.defineProperty(document, "readyState", { configurable: true, get: () => readyState });
  window.localStorage.setItem("svf:progress", JSON.stringify({ currentLevel: 5, totalScore: 0 }));
  window.localStorage.setItem("svf:muted", "0");
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "readyState");
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("music start", () => {
  it("does not touch the music before the page has loaded, then starts the saved level", async () => {
    render(<SuperVoltorbFlipGame />);
    await advance(100);
    expect(audio.playMusic).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("load"));
    });
    await advance(1);
    expect(audio.playMusic).toHaveBeenCalledTimes(1);
    expect(audio.playMusic).toHaveBeenCalledWith(5);
  });

  it("never starts when muted", async () => {
    window.localStorage.setItem("svf:muted", "1");
    render(<SuperVoltorbFlipGame />);
    act(() => {
      window.dispatchEvent(new Event("load"));
    });
    await advance(10);
    expect(audio.playMusic).not.toHaveBeenCalled();
  });

  it("does not start after the game has unmounted", async () => {
    const { unmount } = render(<SuperVoltorbFlipGame />);
    unmount();
    act(() => {
      window.dispatchEvent(new Event("load"));
    });
    await advance(10);
    expect(audio.playMusic).not.toHaveBeenCalled();
  });
});
