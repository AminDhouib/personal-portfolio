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
import { InstructionsBtns, LegendVoltorb, VoltorbIcon } from "../chrome";
import { ExplodeFrameImg, VoltorbSprite } from "../art/voltorb-sprite";
import {
  EXPLODE_FRAME_MAX_PX,
  EXPLODE_FRAME_PX,
  EXPLODE_FRAME_SRCS,
  LEGEND_BURST_FRAMES,
  SPRITE_NO_GRAB_STYLE,
  VOLTORB_ICON_PX,
  VOLTORB_ICON_SRC,
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

// The small icons are the bare body (voltorb-icon.png); the face-up tile uses the whole tile.
function expectOriginalSprite(img: HTMLImageElement | null, src = VOLTORB_ICON_SRC) {
  expect(img).not.toBeNull();
  expect(img!.getAttribute("src")).toBe(src);
  expect(img!.getAttribute("draggable")).toBe("false");
  expect(img!.style.imageRendering).toBe("pixelated");
  expect(img!.style.userSelect).toBe("none");
}

describe("VoltorbSprite", () => {
  it("is the bare icon on request and the whole tile by default", () => {
    const icon = render(<VoltorbSprite variant="icon" size={16} />);
    expect(icon.container.querySelector("img")!.getAttribute("src")).toBe(VOLTORB_ICON_SRC);
    cleanup();
    const tile = render(<VoltorbSprite size={22} />);
    expect(tile.container.querySelector("img")!.getAttribute("src")).toBe(VOLTORB_TILE_SRC);
  });

  it("is the original tile sprite: decorative, crisp, not draggable", () => {
    const { container } = render(<VoltorbSprite size={22} />);
    const img = container.querySelector("img");
    expectOriginalSprite(img, VOLTORB_TILE_SRC);
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
  it("snaps an icon box to a whole multiple of the 16 px icon, never below 1x", () => {
    expect(VOLTORB_ICON_PX).toBe(16);
    expect(crispIconSize(20)).toBe(16);
    expect(crispIconSize(22)).toBe(16);
    expect(crispIconSize(24)).toBe(16);
    expect(crispIconSize(28)).toBe(16);
    expect(crispIconSize(31)).toBe(16);
    expect(crispIconSize(36)).toBe(32);
    expect(crispIconSize(44)).toBe(32);
    expect(crispIconSize(48)).toBe(48);
  });
});

describe("VoltorbIcon", () => {
  it("draws the sprite at a crisp size inside a box of exactly the requested size", () => {
    const { container } = render(<VoltorbIcon size={28} />);
    expect(container.querySelector("svg")).toBeNull();
    const img = container.querySelector<HTMLImageElement>("img");
    expectOriginalSprite(img);
    expect(img!.style.width).toBe("16px");
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

describe("LegendVoltorb", () => {
  const holdOf = (container: HTMLElement) =>
    container.querySelector<HTMLImageElement>(`img[src="${VOLTORB_ICON_SRC}"]`)!;
  const burstOf = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLImageElement>("img")].find((img) =>
      EXPLODE_FRAME_SRCS.includes(img.getAttribute("src") ?? ""),
    );
  const iconVisibility = (container: HTMLElement) =>
    (holdOf(container).closest("span[style*='visibility']") as HTMLElement | null)?.style
      .visibility;

  it("only plays the burst frames that are transparent, never the opaque tile frames", () => {
    expect(LEGEND_BURST_FRAMES).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it("holds the bare icon for the pause, with no burst on screen", () => {
    const { container } = render(<LegendVoltorb size={24} burstSize={36} />);
    expect(burstOf(container)).toBeUndefined();
    expect(iconVisibility(container)).toBe("visible");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("then plays frames 3 to 8 in order and returns to the icon, looping", async () => {
    const { container } = render(<LegendVoltorb size={24} burstSize={36} />);
    const played: string[] = [];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    for (let i = 0; i < LEGEND_BURST_FRAMES.length; i++) {
      played.push(burstOf(container)!.getAttribute("src")!);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(70);
      });
    }
    expect(played).toEqual(LEGEND_BURST_FRAMES.map((f) => EXPLODE_FRAME_SRCS[f]));
    expect(burstOf(container)).toBeUndefined();
    expect(iconVisibility(container)).toBe("visible");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(burstOf(container)!.getAttribute("src")).toBe(EXPLODE_FRAME_SRCS[3]);
  });

  it("renders no opaque tile frame (explode_0 to explode_2) at any point of the loop", async () => {
    const { container } = render(<LegendVoltorb size={22} burstSize={38} />);
    const opaque = new Set(EXPLODE_FRAME_SRCS.slice(0, 3));
    for (let t = 0; t < 40; t++) {
      for (const img of container.querySelectorAll("img")) {
        expect(opaque.has(img.getAttribute("src") ?? "")).toBe(false);
      }
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40);
      });
    }
  });

  it("hides the static icon, keeping its box, whenever a burst frame shows", async () => {
    const { container } = render(<LegendVoltorb size={24} burstSize={36} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    for (let i = 0; i < LEGEND_BURST_FRAMES.length; i++) {
      expect(burstOf(container)).toBeDefined();
      expect(iconVisibility(container)).toBe("hidden");
      expect(holdOf(container)).not.toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(70);
      });
    }
    expect(iconVisibility(container)).toBe("visible");
  });

  it.each([36, 38])(
    "scales every burst frame by box/64 so the burst never leaves its %ipx box",
    async (burstSize) => {
      expect(EXPLODE_FRAME_MAX_PX).toBe(64);
      const { container } = render(<LegendVoltorb size={22} burstSize={burstSize} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      for (const f of LEGEND_BURST_FRAMES) {
        const img = burstOf(container)!;
        const width = parseFloat(img.style.width);
        expect(img.style.width.endsWith("px")).toBe(true);
        expect(width).toBeCloseTo((EXPLODE_FRAME_PX[f]! * burstSize) / EXPLODE_FRAME_MAX_PX, 1);
        expect(width).toBeLessThanOrEqual(burstSize);
        expect(img.style.height).toBe(img.style.width);
        expect(img.style.imageRendering).toBe("pixelated");
        await act(async () => {
          await vi.advanceTimersByTimeAsync(70);
        });
      }
    },
  );

  it("keeps the icon box size, so the card layout does not change", () => {
    const { container } = render(<LegendVoltorb size={24} burstSize={36} />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.style.width).toBe("24px");
    expect(box.style.height).toBe("24px");
  });
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
    // Nothing is face-up yet, so every Voltorb is the small bare icon.
    for (const img of imgs) expect(img.getAttribute("src")).toBe(VOLTORB_ICON_SRC);
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
      (img) => img.getAttribute("src") === VOLTORB_ICON_SRC,
    );
    // The title icon and the two legend cards.
    expect(sprites.length).toBeGreaterThanOrEqual(3);
    // Both legend cards hold the bare icon first: no burst frame is on screen until the pause ends.
    const burstImgs = () =>
      [...modal.querySelectorAll<HTMLImageElement>("img")].filter((img) =>
        EXPLODE_FRAME_SRCS.includes(img.getAttribute("src") ?? ""),
      );
    expect(burstImgs()).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(burstImgs()).toHaveLength(2);
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
      [VOLTORB_TILE_SRC, VOLTORB_ICON_SRC, ...EXPLODE_FRAME_SRCS].sort(),
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
    expectOriginalSprite(face, VOLTORB_TILE_SRC);
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
