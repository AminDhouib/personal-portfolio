import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RoundResult } from "../round-result";

afterEach(cleanup);

describe("RoundResult", () => {
  it("renders the loss text and the level move", () => {
    render(<RoundResult kind="lose" fromLevel={5} toLevel={3} onContinue={() => {}} />);
    expect(screen.getByText("Voltorb! Round lost.")).toBeTruthy();
    expect(screen.getByText("Dropped to Level 3. No coins this round.")).toBeTruthy();
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
    expect(screen.getByText("Moved up to Level 3.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next round" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("says the level held when it did not move", () => {
    render(<RoundResult kind="lose" fromLevel={1} toLevel={1} onContinue={() => {}} />);
    expect(screen.getByText("Staying on Level 1. No coins this round.")).toBeTruthy();
  });

  it("names the top level when a win cannot move up", () => {
    render(<RoundResult kind="win" fromLevel={8} toLevel={8} coins={2187} onContinue={() => {}} />);
    expect(screen.getByText("Top level: Level 8.")).toBeTruthy();
  });

  it("a quit with coins says what was banked", () => {
    render(<RoundResult kind="quit" fromLevel={4} toLevel={2} coins={36} onContinue={() => {}} />);
    expect(screen.getByText("You quit. +36 coins")).toBeTruthy();
    expect(screen.getByText("Dropped to Level 2.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next round" })).toBeTruthy();
  });

  it("a quit with no coins says so", () => {
    render(<RoundResult kind="quit" fromLevel={1} toLevel={1} coins={0} onContinue={() => {}} />);
    expect(screen.getByText("You quit with no coins.")).toBeTruthy();
    expect(screen.getByText("Staying on Level 1.")).toBeTruthy();
  });

  it("a win that keeps the level says how to reach Level 8", () => {
    render(<RoundResult kind="win" fromLevel={7} toLevel={7} coins={1152} onContinue={() => {}} />);
    expect(
      screen.getByText("Staying on Level 7. Five strong rounds in a row reach Level 8."),
    ).toBeTruthy();
  });

  it("reserves the banner height: 72px below sm, 60px from sm", () => {
    const { container } = render(
      <RoundResult kind="win" fromLevel={1} toLevel={2} coins={5} onContinue={() => {}} />,
    );
    const root = container.firstElementChild;
    expect(root?.classList.contains("min-h-[72px]")).toBe(true);
    expect(root?.classList.contains("sm:min-h-[60px]")).toBe(true);
  });
});

describe("RoundResult (daily)", () => {
  it("reads See results and drops the level talk", () => {
    render(
      <RoundResult kind="win" fromLevel={5} toLevel={5} coins={512} daily onContinue={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "See results" })).toBeTruthy();
    expect(screen.queryByText(/Level/)).toBeNull();
    expect(screen.getByText("Board cleared! +512 coins")).toBeTruthy();
  });
});

describe("RoundResult (assisted)", () => {
  it("says an assisted round is not in the record", () => {
    render(
      <RoundResult
        kind="win"
        fromLevel={1}
        toLevel={2}
        coins={24}
        assisted
        onContinue={() => {}}
      />,
    );
    expect(screen.getByText(/Assisted: not in your record\./)).toBeTruthy();
  });

  it("says nothing of the sort for a plain round", () => {
    render(<RoundResult kind="win" fromLevel={1} toLevel={2} coins={24} onContinue={() => {}} />);
    expect(screen.queryByText(/Assisted/)).toBeNull();
  });
});
