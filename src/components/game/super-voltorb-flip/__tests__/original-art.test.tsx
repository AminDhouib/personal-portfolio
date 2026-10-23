import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
import {
  EXPLODE_FRAME_PX,
  EXPLODE_FRAME_SRCS,
  LEGEND_BURST_FRAMES,
  SPRITE_NO_GRAB_STYLE,
  VOLTORB_FACE_SCALE,
  VOLTORB_ICON_PX,
  VOLTORB_ICON_SRC,
  VOLTORB_TILE_PX,
  VOLTORB_TILE_SRC,
  explodeFrameCssSize,
  resetOriginalSpritePreloadForTests,
} from "../art/original-sprites";
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("original sprite paths", () => {
  it("points at the Voltorb tile sprite and the nine explode frames", () => {
    expect(VOLTORB_TILE_SRC).toBe(`${SPRITES}/voltorb.png`);
    expect(EXPLODE_FRAME_SRCS).toHaveLength(BURST_FRAMES);
    EXPLODE_FRAME_SRCS.forEach((src, i) => expect(src).toBe(`${SPRITES}/explode_${i}.png`));
  });

  it("records each sprite's native size, as the PNG header says", () => {
    const size = (src: string) => {
      const png = readFileSync(join(process.cwd(), "public", src));
      return [png.readUInt32BE(16), png.readUInt32BE(20)];
    };
    expect(size(VOLTORB_TILE_SRC)).toEqual([VOLTORB_TILE_PX, VOLTORB_TILE_PX]);
    EXPLODE_FRAME_SRCS.forEach((src, i) =>
      expect(size(src)).toEqual([EXPLODE_FRAME_PX[i], EXPLODE_FRAME_PX[i]]),
    );
  });

  it("derives the bare icon crisply from the tile sprite: a palette PNG, no partial alpha", () => {
    expect(VOLTORB_ICON_SRC).toBe(`${SPRITES.replace("/tile", "")}/voltorb-icon.png`);
    const png = readFileSync(join(process.cwd(), "public", VOLTORB_ICON_SRC));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
      VOLTORB_ICON_PX,
      VOLTORB_ICON_PX,
    ]);
    expect(png[25]).toBe(3); // colour type 3: palette
    // Walk the chunks: tRNS must exist and hold only fully transparent or fully opaque entries.
    let offset = 8;
    let trns: Buffer | null = null;
    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      if (png.toString("ascii", offset + 4, offset + 8) === "tRNS") {
        trns = png.subarray(offset + 8, offset + 8 + length);
      }
      offset += 12 + length;
    }
    expect(trns).not.toBeNull();
    for (const alpha of trns!) expect([0, 255]).toContain(alpha);
    expect([...trns!].filter((a) => a === 0)).toHaveLength(1);
  });

  it("tells the opaque tile frames from the transparent burst frames by their tRNS chunk", () => {
    const hasTrns = (src: string) => {
      const png = readFileSync(join(process.cwd(), "public", src));
      for (let offset = 8; offset < png.length; offset += 12 + png.readUInt32BE(offset)) {
        if (png.toString("ascii", offset + 4, offset + 8) === "tRNS") return true;
      }
      return false;
    };
    // Frames 0 to 2 are opaque tile shake frames; 3 to 8 are the burst on transparency.
    EXPLODE_FRAME_SRCS.forEach((src, i) => expect(hasTrns(src), `explode_${i}`).toBe(i >= 3));
    expect(LEGEND_BURST_FRAMES.every((f) => hasTrns(EXPLODE_FRAME_SRCS[f]!))).toBe(true);
  });

  it("grows the burst from the tile size up to its largest frame", () => {
    expect(EXPLODE_FRAME_PX[0]).toBe(VOLTORB_TILE_PX);
    expect([...EXPLODE_FRAME_PX]).toEqual([...EXPLODE_FRAME_PX].sort((a, b) => a - b));
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
        revealed = screen.queryAllByRole("button", { name: /revealed, Voltorb$/ })[0] ?? null;
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

  it("cannot be dragged or saved, and a click on it still reaches the tile", async () => {
    render(<SuperVoltorbFlipGame />);
    let revealed: HTMLElement | null = null;
    for (let row = 1; row <= 5 && !revealed; row++) {
      for (let col = 1; col <= 5 && !revealed; col++) {
        const tile = screen.queryByRole("button", { name: `Row ${row}, Col ${col}, face down` });
        if (!tile) continue;
        fireEvent.click(tile);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000);
        });
        revealed = screen.queryAllByRole("button", { name: /revealed, Voltorb$/ })[0] ?? null;
      }
    }
    const img = revealed!.querySelector<HTMLImageElement>("img.voltorb")!;
    expect(img.getAttribute("draggable")).toBe("false");
    expect(img.style.userSelect).toBe("none");
    const reachedTile = vi.fn();
    revealed!.addEventListener("click", reachedTile);
    fireEvent.click(img);
    expect(reachedTile).toHaveBeenCalledTimes(1);
  });
});

describe("sprite preload", () => {
  it("requests the Voltorb tile and all nine explode frames when the game mounts", () => {
    const requested: string[] = [];
    vi.stubGlobal(
      "Image",
      class {
        set src(value: string) {
          requested.push(value);
        }
      },
    );
    resetOriginalSpritePreloadForTests();
    render(<SuperVoltorbFlipGame />);
    expect([...new Set(requested)].sort()).toEqual(
      [VOLTORB_TILE_SRC, VOLTORB_ICON_SRC, ...EXPLODE_FRAME_SRCS].sort(),
    );
  });
});

describe("sprite grab guard", () => {
  it("suppresses the iOS long-press sheet and text selection", () => {
    // jsdom drops the vendor-prefixed property from an element's style, so the shared object
    // both sprite images spread is what is pinned.
    expect(SPRITE_NO_GRAB_STYLE).toEqual({ WebkitTouchCallout: "none", userSelect: "none" });
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

  it("scales every frame so the Voltorb baked into it matches the tile face", async () => {
    const Burst = theme.BombFlip;
    const { container } = render(<Burst row={0} col={0} onDone={() => {}} />);
    for (let i = 0; i < BURST_FRAMES; i++) {
      const img = container.querySelector("img")!;
      // One native pixel is the same size in every frame, and the tile face draws its 22 px
      // Voltorb at VOLTORB_FACE_SCALE of the tile, so a frame is (frame px / 22) faces wide.
      expect(img.style.width).toBe(explodeFrameCssSize(i));
      expect(img.style.height).toBe(explodeFrameCssSize(i));
      expect(explodeFrameCssSize(i)).toBe(
        `calc(var(--svf-tile) * ${((VOLTORB_FACE_SCALE * EXPLODE_FRAME_PX[i]!) / VOLTORB_TILE_PX).toFixed(4)})`,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });
    }
  });

  it("is a pixelated image over the tile that never takes the pointer", () => {
    const Burst = theme.BombFlip;
    const { container } = render(<Burst row={0} col={0} onDone={() => {}} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.style.imageRendering).toBe("pixelated");
    expect(img.style.pointerEvents).toBe("none");
    expect(img.getAttribute("draggable")).toBe("false");
    expect(img.style.userSelect).toBe("none");
  });

  it("leaves the success sparkle as inline SVG", () => {
    const Sparkle = theme.CoinReveal;
    const { container } = render(<Sparkle row={0} col={0} onDone={() => {}} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
