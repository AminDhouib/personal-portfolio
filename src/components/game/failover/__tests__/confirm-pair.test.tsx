import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HudState, Pending } from "../controller";
import { resetSim } from "../sim/state";
import { ConfirmPair } from "../ui/confirm-pair";
import { makeController } from "./ui-harness";

// The Confirm and Cancel pair is as wide as its question plus two thumb-sized
// buttons, about 230 to 280 px. Wherever its ghost is, all of it stays on a
// 390x844 phone board (the board clips anything past its edge).

const BOARD = { width: 390, height: 844 };
const PAIR = { width: 280, height: 56 };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetSim({ seed: "confirm-pair-reset" });
});

/** jsdom has no layout: the board and the pair report the sizes a phone would. */
function stubLayout() {
  const size = (el: HTMLElement, key: "width" | "height") =>
    el.getAttribute("role") === "group" ? PAIR[key] : BOARD[key];
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return size(this, "width");
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return size(this, "height");
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return size(this, "width");
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return size(this, "height");
  });
}

/** The pair's box on the board, read from its style: left and top are its corner. */
function pairRect(anchor: { x: number; y: number }) {
  const { controller } = makeController();
  const pending: Pending = { kind: "place", name: "Compute", ...anchor };
  const hud: HudState = { ...controller.getHud(), pending };
  render(
    <div style={{ position: "relative", width: BOARD.width, height: BOARD.height }}>
      <ConfirmPair hud={hud} controller={controller} />
    </div>,
  );
  const pair = screen.getByRole("group", { name: "Build Compute here?" });
  // A CSS transform would move the box away from its style; there must be none.
  expect(pair.className).not.toMatch(/translate/);
  const left = parseFloat(pair.style.left);
  const top = parseFloat(pair.style.top);
  return { left, top, right: left + PAIR.width, bottom: top + PAIR.height };
}

describe("ConfirmPair", () => {
  it.each([
    ["the far left", { x: 0, y: 422 }],
    ["the far right", { x: 390, y: 422 }],
    ["the top", { x: 195, y: 0 }],
    ["the bottom", { x: 195, y: 844 }],
    ["a corner", { x: 390, y: 844 }],
  ])("keeps the whole pair on the board for a ghost at %s", (_, anchor) => {
    stubLayout();
    const rect = pairRect(anchor);
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(BOARD.width);
    expect(rect.bottom).toBeLessThanOrEqual(BOARD.height);
  });

  it("sits centred just under a ghost in the open", () => {
    stubLayout();
    const rect = pairRect({ x: 195, y: 300 });
    expect(rect.left).toBe(195 - PAIR.width / 2);
    expect(rect.top).toBeGreaterThan(300);
    expect(rect.top).toBeLessThan(330);
  });

  it("goes above the ghost when there is no room under it", () => {
    stubLayout();
    const rect = pairRect({ x: 195, y: 820 });
    expect(rect.bottom).toBeLessThan(820);
  });
});
