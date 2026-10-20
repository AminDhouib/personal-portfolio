import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Game } from "../game";
import { canvasLayout, SHOOTER_CAPTION } from "@/components/game/space-shooter/canvas-layout";

// Whether the section is near the viewport, as framer-motion's useInView reports it.
let mockNear = true;
const mockUseInView = vi.fn((_ref: unknown, _options: unknown) => mockNear);

vi.mock("framer-motion", () => ({
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
  MotionConfig: ({ children }: { children: ReactNode }) => <>{children}</>,
  useInView: (ref: unknown, options: unknown) => mockUseInView(ref, options),
}));

// The options the section hands next/dynamic, read back to check the loading fallback.
const dynamicOptions = vi.hoisted(() => ({
  current: null as { loading?: () => ReactNode } | null,
}));

vi.mock("next/dynamic", () => ({
  default: (_load: unknown, options: { loading?: () => ReactNode }) => {
    dynamicOptions.current = options;
    return () => <div data-testid="shooter" />;
  },
}));

vi.mock("@/components/three/webgl-only", () => ({
  WebGLOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/game/registry", () => ({
  GameBanner: () => <div data-testid="game-banner" />,
}));

describe("Game section", () => {
  beforeEach(() => {
    mockNear = true;
    mockUseInView.mockClear();
  });

  it("links every featured game and the hub as crawlable anchors", () => {
    render(<Game />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/games/super-voltorb-flip",
      "/games/hextris",
      "/games/script-knight",
      "/games/failover",
      "/games",
    ]);
  });

  it("wraps the playable game in a data-motion-exempt contents element (reduced-motion net)", () => {
    render(<Game />);
    const wrapper = screen.getByTestId("shooter").closest("[data-motion-exempt]");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.className).toBe("contents");
  });

  it("holds the game's place with a canvas-sized box until the section nears the viewport", () => {
    mockNear = false;
    render(<Game />);
    expect(screen.queryByTestId("shooter")).toBeNull();
    const placeholder = screen.getByTestId("shooter-placeholder");
    expect(placeholder.className).toContain(canvasLayout("embed", false).sizeClass);
    // The caption the game renders under its canvas is held too, so the swap moves nothing.
    expect(screen.getByText(SHOOTER_CAPTION)).toBeTruthy();
    // Watched once, well ahead of the viewport, so the game is ready when it is reached.
    expect(mockUseInView).toHaveBeenCalledWith(expect.anything(), {
      once: true,
      margin: "1200px 0px",
    });
  });

  it("mounts the game in place of the box once the section is near", () => {
    mockNear = false;
    const { rerender } = render(<Game />);
    expect(screen.queryByTestId("shooter")).toBeNull();
    mockNear = true;
    rerender(<Game />);
    expect(screen.getByTestId("shooter")).toBeTruthy();
    expect(screen.queryByTestId("shooter-placeholder")).toBeNull();
  });

  it("keeps the placeholder up while the game chunk downloads", () => {
    const loading = dynamicOptions.current?.loading;
    expect(loading).toBeDefined();
    render(<>{loading?.()}</>);
    expect(screen.getByTestId("shooter-placeholder")).toBeTruthy();
    expect(screen.getByText(SHOOTER_CAPTION)).toBeTruthy();
  });
});
