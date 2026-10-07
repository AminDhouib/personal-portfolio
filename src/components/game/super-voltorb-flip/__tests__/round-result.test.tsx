import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RoundResult } from "../round-result";

afterEach(cleanup);

describe("RoundResult", () => {
  it("renders the loss text and the level line", () => {
    render(<RoundResult kind="lose" fromLevel={5} toLevel={3} onContinue={() => {}} />);
    expect(screen.getByText("Voltorb! Round lost.")).toBeTruthy();
    expect(screen.getByText("Level 5 to Level 3")).toBeTruthy();
  });

  it("names the loss button Continue and calls onContinue once per click", () => {
    const onContinue = vi.fn();
    render(<RoundResult kind="lose" fromLevel={5} toLevel={3} onContinue={onContinue} />);
    const button = screen.getByRole("button", { name: "Continue" });
    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("focuses the button automatically", () => {
    render(<RoundResult kind="lose" fromLevel={2} toLevel={1} onContinue={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continue" }));
  });

  it("shows the coins won and a Next round button for a win", () => {
    const onContinue = vi.fn();
    render(<RoundResult kind="win" fromLevel={2} toLevel={3} coins={24} onContinue={onContinue} />);
    expect(screen.getByText("Round cleared! +24 coins")).toBeTruthy();
    expect(screen.getByText("Level 2 to Level 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next round" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("says the level held when it did not move", () => {
    render(<RoundResult kind="lose" fromLevel={1} toLevel={1} onContinue={() => {}} />);
    expect(screen.getByText("Staying on Level 1")).toBeTruthy();
  });

  it("names the top level when a win cannot move up", () => {
    render(<RoundResult kind="win" fromLevel={8} toLevel={8} coins={2187} onContinue={() => {}} />);
    expect(screen.getByText("Top level: Level 8")).toBeTruthy();
  });

  it("a quit with coins says what was banked", () => {
    render(<RoundResult kind="quit" fromLevel={4} toLevel={2} coins={36} onContinue={() => {}} />);
    expect(screen.getByText("You quit. +36 coins")).toBeTruthy();
    expect(screen.getByText("Level 4 to Level 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next round" })).toBeTruthy();
  });

  it("a quit with no coins says so", () => {
    render(<RoundResult kind="quit" fromLevel={1} toLevel={1} coins={0} onContinue={() => {}} />);
    expect(screen.getByText("You quit with no coins.")).toBeTruthy();
    expect(screen.getByText("Staying on Level 1")).toBeTruthy();
  });

  it("a win that keeps the level says how to reach Level 8", () => {
    render(<RoundResult kind="win" fromLevel={7} toLevel={7} coins={1152} onContinue={() => {}} />);
    expect(
      screen.getByText("Staying on Level 7. Five strong rounds in a row reach Level 8."),
    ).toBeTruthy();
  });
});
