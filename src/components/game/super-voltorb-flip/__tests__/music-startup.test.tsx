import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode, type ReactNode } from "react";
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
let hidden = false;

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  audio.playMusic.mockClear();
  readyState = "loading";
  hidden = false;
  Object.defineProperty(document, "readyState", { configurable: true, get: () => readyState });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  window.localStorage.setItem("svf:progress", JSON.stringify({ currentLevel: 5, totalScore: 0 }));
  window.localStorage.setItem("svf:muted", "0");
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "readyState");
  Reflect.deleteProperty(document, "hidden");
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

  it("starts on the next task when the page had already loaded (client navigation)", async () => {
    readyState = "complete";
    render(<SuperVoltorbFlipGame />);
    await advance(10);
    expect(audio.playMusic).toHaveBeenCalledTimes(1);
    expect(audio.playMusic).toHaveBeenCalledWith(5);
  });

  it("starts once under StrictMode's double effect", async () => {
    readyState = "complete";
    render(
      <StrictMode>
        <SuperVoltorbFlipGame />
      </StrictMode>,
    );
    await advance(10);
    expect(audio.playMusic).toHaveBeenCalledTimes(1);
  });

  it("does not start in a tab opened in the background", async () => {
    hidden = true;
    render(<SuperVoltorbFlipGame />);
    act(() => {
      window.dispatchEvent(new Event("load"));
    });
    await advance(10);
    expect(audio.playMusic).not.toHaveBeenCalled();
  });
});
