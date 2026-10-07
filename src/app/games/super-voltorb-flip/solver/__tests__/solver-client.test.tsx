import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { SolverClient } from "../solver-client";

afterEach(cleanup);

function fillAllOnes() {
  // An all-1s board: every line is 5 coins, 0 Voltorbs.
  for (const kind of ["Row", "Column"]) {
    for (let i = 1; i <= 5; i++) {
      fireEvent.change(screen.getByLabelText(`${kind} ${i} coins`), { target: { value: "5" } });
      fireEvent.change(screen.getByLabelText(`${kind} ${i} Voltorbs`), { target: { value: "0" } });
    }
  }
}

describe("SolverClient", () => {
  it("asks for all ten clues first", () => {
    render(<SolverClient />);
    expect(screen.getByRole("status").textContent).toContain("Enter all ten clues");
  });

  it("solves a complete clue set and marks every tile 0% Voltorb", () => {
    render(<SolverClient />);
    fillAllOnes();
    expect(screen.getByRole("status").textContent).toContain("1 board fits");
    expect(screen.getAllByRole("button", { name: /0% Voltorb/ })).toHaveLength(25);
  });

  it("explains a clue that cannot fit", () => {
    render(<SolverClient />);
    fillAllOnes();
    fireEvent.change(screen.getByLabelText("Row 1 coins"), { target: { value: "3" } });
    expect(screen.getByRole("status").textContent).toContain("A clue does not fit");
  });

  it("cycles a tile through the flipped values", () => {
    render(<SolverClient />);
    const tile = screen.getByRole("button", { name: /^Row 1, column 1:/ });
    fireEvent.click(tile);
    expect(tile.getAttribute("aria-label")).toContain("Flipped as 1");
    fireEvent.click(tile);
    expect(tile.getAttribute("aria-label")).toContain("Flipped as 2");
    fireEvent.click(tile);
    expect(tile.getAttribute("aria-label")).toContain("Flipped as 3");
    fireEvent.click(tile);
    expect(tile.getAttribute("aria-label")).toContain("Face down");
  });

  it("moves focus to the next clue after a Voltorb count", () => {
    render(<SolverClient />);
    fireEvent.change(screen.getByLabelText("Row 1 Voltorbs"), { target: { value: "1" } });
    expect(document.activeElement).toBe(screen.getByLabelText("Row 2 coins"));
  });

  it("clears every box and tile", () => {
    render(<SolverClient />);
    fillAllOnes();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("status").textContent).toContain("Enter all ten clues");
    expect((screen.getByLabelText("Row 1 coins") as HTMLInputElement).value).toBe("");
  });
});
