import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Game } from "../game";

vi.mock("framer-motion", () => ({
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
  MotionConfig: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="shooter" /> }));

vi.mock("@/components/three/webgl-only", () => ({
  WebGLOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/game/registry", () => ({
  GameBanner: () => <div data-testid="game-banner" />,
}));

describe("Game section", () => {
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
});
