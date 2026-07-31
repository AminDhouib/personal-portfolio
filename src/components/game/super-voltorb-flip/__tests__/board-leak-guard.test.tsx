import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

// next/font/local runs in the Next build pipeline, not vitest -- stub it to the
// shape the component consumes (a className it spreads onto tiles).
vi.mock("next/font/local", () => ({
  default: () => ({ className: "mock-font", style: { fontFamily: "mock" } }),
}));

// jsdom has no real audio pipeline (HTMLMediaElement.play is unimplemented and
// throws). The board's rendering is what is under test, so silence the layer.
vi.mock("../audio", () => ({
  sfx: new Proxy({}, { get: () => () => Promise.resolve() }),
  playMusic: () => {},
  stopMusic: () => {},
  fadeOutMusic: () => {},
  playGameOver: () => {},
  stopGameOver: () => {},
  playLevelWin: () => {},
  stopLevelWin: () => {},
  setMusicMuted: () => {},
}));

import { SuperVoltorbFlipGame } from "../../super-voltorb-flip";

afterEach(cleanup);

/**
 * Solution-leak guard, the same shape as password-game-2's colour-swatch
 * title-attr guard: a hidden answer must not be reachable through the DOM.
 *
 * Face-down here is purely a CSS rotateY on the tile wrapper -- both faces stay
 * mounted -- so rendering the value into the back face unconditionally exposed
 * the entire board through textContent. A player could read every tile's value
 * without flipping anything, which is the whole game.
 */
describe("SuperVoltorbFlip board", () => {
  function faceDownTiles(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>("[aria-label]")).filter((el) =>
      (el.getAttribute("aria-label") ?? "").includes("face down"),
    );
  }

  it("renders a board of face-down tiles", () => {
    const { container } = render(<SuperVoltorbFlipGame />);
    expect(faceDownTiles(container).length).toBeGreaterThan(0);
  });

  it("leaks no tile value through the text of a face-down tile", () => {
    const { container } = render(<SuperVoltorbFlipGame />);
    const tiles = faceDownTiles(container);
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.textContent).toBe("");
    }
  });

  it("leaks no Voltorb sprite through a face-down tile", () => {
    const { container } = render(<SuperVoltorbFlipGame />);
    for (const tile of faceDownTiles(container)) {
      // The Voltorb face is an <img>, so an empty textContent alone would not
      // prove it is hidden -- assert the element itself is unmounted.
      expect(tile.querySelector("img.voltorb")).toBeNull();
    }
  });
});
