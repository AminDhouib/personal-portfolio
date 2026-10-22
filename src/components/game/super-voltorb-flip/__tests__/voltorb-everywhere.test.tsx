import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import { firstButton } from "@/test/first-button";

// Pins "one consistent Voltorb everywhere" (T-6535 follow-up, Amin's ruling on #174): every place
// that drew the indigo orb as the Voltorb glyph now draws the original sprite. The CSS legend
// layout, CoinSpinner, the chrome, the text labels and the 1, 2, 3 and X memo glyphs stay as they
// were, so those are pinned as still inline SVG.

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

vi.mock("../effects/context", () => ({
  EffectsProvider: ({ children }: { children: ReactNode }) => children,
  useEffectsTheme: () => null,
}));

import { SuperVoltorbFlipGame } from "../../super-voltorb-flip";
import { SuperVoltorbFlipBanner } from "../../banners";
import { MemoBar, type MemoFlagSet } from "../memo-button";
import { InstructionsBtns, LoopingExplosion, VoltorbIcon } from "../chrome";
import { ExplodeFrameImg, VoltorbSprite } from "../art/voltorb-sprite";
import {
  EXPLODE_FRAME_MAX_PX,
  EXPLODE_FRAME_PX,
  EXPLODE_FRAME_SRCS,
  SPRITE_NO_GRAB_STYLE,
  VOLTORB_TILE_SRC,
  crispIconSize,
  explodeFrameCssSize,
} from "../art/original-sprites";
import { CPU_BOUND_TEST_TIMEOUT_MS } from "@/test/heavy";

// These tests render the whole Super Voltorb Flip board in jsdom; see src/test/heavy.ts for why the
// 5 s default is not enough.
vi.setConfig({ testTimeout: CPU_BOUND_TEST_TIMEOUT_MS });

/** The indigo orb was an 11 x 11 inline SVG; none may be left drawing the Voltorb. */
const ORB_SVG = 'svg[viewBox="0 0 11 11"]';

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.setItem("svf:muted", "1");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

function expectOriginalSprite(img: HTMLImageElement | null) {
  expect(img).not.toBeNull();
  expect(img!.getAttribute("src")).toBe(VOLTORB_TILE_SRC);
  expect(img!.getAttribute("draggable")).toBe("false");
  expect(img!.style.imageRendering).toBe("pixelated");
  expect(img!.style.userSelect).toBe("none");
}

describe("VoltorbSprite", () => {
  it("is the original tile sprite: decorative, crisp, not draggable", () => {
    const { container } = render(<VoltorbSprite size={22} />);
    const img = container.querySelector("img");
    expectOriginalSprite(img);
    expect(img!.getAttribute("alt")).toBe("");
    expect(img!.style.width).toBe("22px");
    expect(img!.style.height).toBe("22px");
    expect(img!.style.display).toBe("block");
    expect(img!.style.flexShrink).toBe("0");
  });

  it("takes a CSS size, a class and extra style", () => {
    const { container } = render(
      <VoltorbSprite
        cssSize="calc(var(--svf-tile) * 0.72)"
        className="picture-outline voltorb"
        style={{ pointerEvents: "none" }}
      />,
    );
    const img = container.querySelector("img")!;
    expect(img.style.width).toContain("var(--svf-tile)");
    expect(img.classList.contains("picture-outline")).toBe(true);
    expect(img.classList.contains("voltorb")).toBe(true);
    expect(img.style.pointerEvents).toBe("none");
  });

  it("spreads the shared no-grab style", () => {
    expect(SPRITE_NO_GRAB_STYLE).toEqual({ WebkitTouchCallout: "none", userSelect: "none" });
  });
});

describe("ExplodeFrameImg", () => {
  it("draws the original frame, centred, at its native pixel size by default", () => {
    EXPLODE_FRAME_SRCS.forEach((src, i) => {
      const { container } = render(<ExplodeFrameImg frame={i} />);
      const img = container.querySelector("img")!;
      expect(img.getAttribute("src")).toBe(src);
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("draggable")).toBe("false");
      expect(img.style.width).toBe(`${EXPLODE_FRAME_PX[i]}px`);
      expect(img.style.height).toBe(`${EXPLODE_FRAME_PX[i]}px`);
      expect(img.style.position).toBe("absolute");
      expect(img.style.pointerEvents).toBe("none");
      expect(img.style.imageRendering).toBe("pixelated");
      cleanup();
    });
  });

  it("takes a CSS size for the board burst", () => {
    const { container } = render(<ExplodeFrameImg frame={8} cssSize={explodeFrameCssSize(8)} />);
    expect(container.querySelector("img")!.style.width).toBe(explodeFrameCssSize(8));
  });
});

describe("crispIconSize", () => {
  it("snaps an icon box to a whole multiple of the 22 px art, never below 1x", () => {
    expect(crispIconSize(20)).toBe(22);
    expect(crispIconSize(22)).toBe(22);
    expect(crispIconSize(24)).toBe(22);
    expect(crispIconSize(28)).toBe(22);
    expect(crispIconSize(36)).toBe(22);
    expect(crispIconSize(44)).toBe(44);
    expect(crispIconSize(46)).toBe(44);
    expect(crispIconSize(66)).toBe(66);
  });
});

describe("VoltorbIcon", () => {
  it("draws the sprite at a crisp size inside a box of exactly the requested size", () => {
    const { container } = render(<VoltorbIcon size={28} />);
    expect(container.querySelector("svg")).toBeNull();
    const img = container.querySelector<HTMLImageElement>("img");
    expectOriginalSprite(img);
    expect(img!.style.width).toBe("22px");
    const box = img!.parentElement as HTMLElement;
    expect(box.style.width).toBe("28px");
    expect(box.style.height).toBe("28px");
    expect(box.style.flexShrink).toBe("0");
  });

  it("scales with a CSS length for the clue cards, with no wrapper", () => {
    const { container } = render(
      <VoltorbIcon cssSize="calc(var(--svf-tile) * 0.72)" className="voltorb object-contain" />,
    );
    const img = container.querySelector<HTMLImageElement>("img")!;
    expectOriginalSprite(img);
    expect(img.style.width).toBe("calc(var(--svf-tile) * 0.72)");
    expect(img.classList.contains("object-contain")).toBe(true);
    expect(container.firstElementChild).toBe(img);
  });

  it("is the icon on the How to play button", () => {
    const { container } = render(<InstructionsBtns onOpen={() => {}} />);
    expectOriginalSprite(container.querySelector("button img"));
    expect(container.querySelector(ORB_SVG)).toBeNull();
    expect(screen.getByRole("button", { name: "How to play" })).toBeTruthy();
  });
});

describe("LoopingExplosion", () => {
  it("loops the original explode frames, holding the first, in a box that keeps its size", async () => {
    const { container } = render(<LoopingExplosion size={36} />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.style.width).toBe("36px");
    expect(box.style.height).toBe("36px");
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("img")!.getAttribute("src")).toBe(EXPLODE_FRAME_SRCS[0]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(container.querySelector("img")!.getAttribute("src")).toBe(EXPLODE_FRAME_SRCS[1]);
    for (let f = 2; f < EXPLODE_FRAME_SRCS.length; f++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(70);
      });
      expect(container.querySelector("img")!.getAttribute("src")).toBe(EXPLODE_FRAME_SRCS[f]);
    }
  });

  it.each([36, 38])(
    "scales every frame by box/64 so the burst never leaves its %ipx box",
    async (size) => {
      expect(EXPLODE_FRAME_MAX_PX).toBe(64);
      const { container } = render(<LoopingExplosion size={size} />);
      for (let f = 0; f < EXPLODE_FRAME_SRCS.length; f++) {
        const img = container.querySelector("img")!;
        const width = parseFloat(img.style.width);
        expect(img.style.width.endsWith("px")).toBe(true);
        expect(width).toBeCloseTo((EXPLODE_FRAME_PX[f]! * size) / EXPLODE_FRAME_MAX_PX, 1);
        expect(width).toBeLessThanOrEqual(size);
        expect(img.style.height).toBe(img.style.width);
        expect(img.style.imageRendering).toBe("pixelated");
        await act(async () => {
          await vi.advanceTimersByTimeAsync(f === 0 ? 500 : 70);
        });
      }
    },
  );
});

describe("MemoBar", () => {
  it("draws the Voltorb flag as the sprite and keeps 1, 2, 3 and the clear mark as SVG", () => {
    const { container } = render(
      <MemoBar activeFlags={new Set() as MemoFlagSet} onToggle={() => {}} onClear={() => {}} />,
    );
    const voltorb = screen.getByRole("button", { name: "Memo V" });
    expectOriginalSprite(voltorb.querySelector("img"));
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelectorAll("svg")).toHaveLength(4);
    for (const name of ["Memo 1", "Memo 2", "Memo 3", "Clear all memo flags"]) {
      const button = screen.getByRole("button", { name });
      expect(button.querySelector("svg"), name).not.toBeNull();
      expect(button.querySelector("img"), name).toBeNull();
    }
    expect(container.querySelector(ORB_SVG)).toBeNull();
  });

  it("keeps the face size and the sprite at 62 percent of it, as the glyph was", () => {
    render(
      <MemoBar
        activeFlags={new Set() as MemoFlagSet}
        onToggle={() => {}}
        onClear={() => {}}
        size={36}
      />,
    );
    const face = screen.getByRole("button", { name: "Memo V" }).firstElementChild as HTMLElement;
    expect(face.style.width).toBe("36px");
    expect(face.style.height).toBe("36px");
    expect(face.querySelector("img")!.style.width).toBe("62%");
  });
});

describe("the board", () => {
  it("draws no orb anywhere, and every Voltorb on the page is the sprite", () => {
    const { container } = render(<SuperVoltorbFlipGame />);
    expect(container.querySelector(ORB_SVG)).toBeNull();
    const imgs = [...container.querySelectorAll("img")];
    // 10 clue cards, the memo bar (the phone and desktop columns each render one) and the How to
    // play button.
    expect(imgs.length).toBeGreaterThanOrEqual(11);
    for (const img of imgs) expect(img.getAttribute("src")).toBe(VOLTORB_TILE_SRC);
  });

  it("keeps the clue-card sprite on the tile-relative size the orb had", () => {
    const { container } = render(<SuperVoltorbFlipGame />);
    const sized = [...container.querySelectorAll<HTMLImageElement>("img.voltorb")].filter((img) =>
      img.style.width.includes("var(--svf-tile) * 0.72"),
    );
    expect(sized).toHaveLength(10);
  });

  it("marks a tile with the Voltorb sprite for the V memo and the digits as SVG", () => {
    render(<SuperVoltorbFlipGame />);
    // The memo is radio-style: one mark at a time, so mark two tiles in turn.
    const flagsOf = (cell: string) =>
      document
        .querySelector<HTMLElement>(`[data-cell="${cell}"]`)!
        .querySelector(".pointer-events-none.grid")!;
    fireEvent.click(firstButton("Memo V"));
    fireEvent.click(document.querySelector<HTMLElement>('[data-cell="0-0"]')!);
    const voltorbMark = flagsOf("0-0");
    expectOriginalSprite(voltorbMark.querySelector("img"));
    expect(voltorbMark.querySelectorAll("img")).toHaveLength(1);
    expect(voltorbMark.querySelectorAll("svg")).toHaveLength(0);

    fireEvent.click(firstButton("Memo 2"));
    fireEvent.click(document.querySelector<HTMLElement>('[data-cell="0-1"]')!);
    const digitMark = flagsOf("0-1");
    expect(digitMark.querySelectorAll("img")).toHaveLength(0);
    expect(digitMark.querySelectorAll("svg")).toHaveLength(1);
  });

  it("shows the sprite and the original burst in the How to play legend", async () => {
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(firstButton("How to play"));
    const modal = screen.getByRole("dialog", { name: "How to play" });
    expect(modal.querySelector(ORB_SVG)).toBeNull();
    const sprites = [...modal.querySelectorAll<HTMLImageElement>("img")].filter(
      (img) => img.getAttribute("src") === VOLTORB_TILE_SRC,
    );
    // The title icon and the two legend cards.
    expect(sprites.length).toBeGreaterThanOrEqual(3);
    const bursts = [...modal.querySelectorAll<HTMLImageElement>("img")].filter((img) =>
      EXPLODE_FRAME_SRCS.includes(img.getAttribute("src") ?? ""),
    );
    expect(bursts).toHaveLength(2);
    // The coin sparkle is still inline SVG.
    expect(modal.querySelector("svg")).not.toBeNull();
  });
});

describe("the hub banner", () => {
  it("draws no orb, and preloads the sprites it needs", () => {
    const requested: string[] = [];
    vi.stubGlobal(
      "Image",
      class {
        set src(value: string) {
          requested.push(value);
        }
      },
    );
    const { container } = render(<SuperVoltorbFlipBanner />);
    expect(container.querySelector(ORB_SVG)).toBeNull();
    expect([...new Set(requested)].sort()).toEqual(
      [VOLTORB_TILE_SRC, ...EXPLODE_FRAME_SRCS].sort(),
    );
  });

  it("shows the sprite on a bomb tile and the original frames for its burst", async () => {
    // Every cell rolls a bomb: pickCellValue draws below the bomb threshold. A zero flip delay
    // puts the burst a quarter of the 6 s cycle in.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { container } = render(<SuperVoltorbFlipBanner />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(container.querySelector(ORB_SVG)).toBeNull();
    const face = container.querySelector<HTMLImageElement>('img[src="' + VOLTORB_TILE_SRC + '"]');
    expectOriginalSprite(face);
    expect(face!.style.width).toBe("22px");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1700);
    });
    const frame = [...container.querySelectorAll<HTMLImageElement>("img")].find((img) =>
      EXPLODE_FRAME_SRCS.includes(img.getAttribute("src") ?? ""),
    );
    expect(frame).toBeDefined();
    expect(container.querySelector(ORB_SVG)).toBeNull();
    vi.restoreAllMocks();
  });
});
