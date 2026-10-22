import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";

// Pins the original Voltorb creature art (T-6535): a revealed Voltorb tile shows the sprite
// image, and the bomb burst plays the nine original explode frames in order. The legend, the
// clue cards, the memo glyphs and the chrome keep their CSS and inline-SVG art.

vi.mock("next/font/local", () => ({
  default: () => ({ className: "mock-font", style: { fontFamily: "mock" } }),
}));

vi.mock("../audio", () => ({
  sfx: new Proxy({}, { get: () => () => Promise.resolve() }),
  playMusic: () => {},
  stopMusic: () => {},
  fadeOutMusic: () => {},
  playGameOver: () => {},
  stopGameOver: () => {},
  playLevelWin: () => {},
  stopLevelWin: () => {},
  stopAllCues: () => {},
  setMusicMuted: () => {},
}));

import { SuperVoltorbFlipGame } from "../../super-voltorb-flip";
import { theme } from "../effects/default";
import { EXPLODE_FRAME_SRCS, VOLTORB_TILE_SRC } from "../art/original-sprites";
import { BURST_FRAMES } from "../art/fx";
import { CPU_BOUND_TEST_TIMEOUT_MS } from "@/test/heavy";

// These tests render the whole Super Voltorb Flip board in jsdom; see src/test/heavy.ts for why the
// 5 s default is not enough.
vi.setConfig({ testTimeout: CPU_BOUND_TEST_TIMEOUT_MS });

const SPRITES = "/games/super-voltorb-flip/sprites/tile";

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockImplementation(seededRandom(4));
  window.localStorage.setItem("svf:muted", "1");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("original sprite paths", () => {
  it("points at the Voltorb tile sprite and the nine explode frames", () => {
    expect(VOLTORB_TILE_SRC).toBe(`${SPRITES}/voltorb.png`);
    expect(EXPLODE_FRAME_SRCS).toHaveLength(BURST_FRAMES);
    EXPLODE_FRAME_SRCS.forEach((src, i) => expect(src).toBe(`${SPRITES}/explode_${i}.png`));
  });
});

describe("revealed Voltorb tile", () => {
  it("shows the original Voltorb sprite, not the inline orb", async () => {
    const { container } = render(<SuperVoltorbFlipGame />);
    let revealed: HTMLElement | null = null;
    for (let row = 1; row <= 5 && !revealed; row++) {
      for (let col = 1; col <= 5 && !revealed; col++) {
        const tile = screen.queryByRole("button", { name: `Row ${row}, Col ${col}, face down` });
        if (!tile) continue;
        fireEvent.click(tile);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000);
        });
        revealed = screen.queryByRole("button", { name: /revealed, Voltorb$/ });
      }
    }
    expect(revealed, "no Voltorb was revealed on the seeded board").not.toBeNull();
    const img = revealed!.querySelector<HTMLImageElement>("img.voltorb");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe(VOLTORB_TILE_SRC);
    expect(img!.getAttribute("alt")).toBe("");
    expect(img!.style.imageRendering).toBe("pixelated");
    expect(revealed!.querySelector("svg.voltorb")).toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
  });
});

describe("bomb burst", () => {
  it("plays the original explode frames in order, then calls onDone", async () => {
    const onDone = vi.fn();
    const Burst = theme.BombFlip;
    const { container } = render(<Burst row={0} col={0} onDone={onDone} />);
    const seen: string[] = [];
    for (let i = 0; i < BURST_FRAMES; i++) {
      seen.push(container.querySelector("img")!.getAttribute("src")!);
      expect(onDone).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(i === BURST_FRAMES - 1 ? 80 : 60);
      });
    }
    expect(seen).toEqual(EXPLODE_FRAME_SRCS);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("is a pixelated image over the tile that never takes the pointer", () => {
    const Burst = theme.BombFlip;
    const { container } = render(<Burst row={0} col={0} onDone={() => {}} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.style.imageRendering).toBe("pixelated");
    expect(img.style.pointerEvents).toBe("none");
  });

  it("leaves the success sparkle as inline SVG", () => {
    const Sparkle = theme.CoinReveal;
    const { container } = render(<Sparkle row={0} col={0} onDone={() => {}} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
