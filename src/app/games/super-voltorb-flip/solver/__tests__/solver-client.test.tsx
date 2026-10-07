import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { generateLayout } from "@/components/game/super-voltorb-flip/hgss";
import type { CellValue } from "@/components/game/super-voltorb-flip/types";
import { SolverClient } from "../solver-client";
import { metadata } from "../page";

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

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Type a dealt board's ten clue pairs into the boxes.
function fillBoardClues(cells: readonly CellValue[]) {
  const line = (indices: number[]) => ({
    coins: indices.reduce((sum, i) => sum + (cells[i] === "V" ? 0 : (cells[i] as number)), 0),
    voltorbs: indices.filter((i) => cells[i] === "V").length,
  });
  const range = [0, 1, 2, 3, 4];
  const lines = [
    ...range.map((r) => ["Row", r, line(range.map((c) => r * 5 + c))] as const),
    ...range.map((c) => ["Column", c, line(range.map((r) => r * 5 + c))] as const),
  ];
  for (const [kind, i, clue] of lines) {
    fireEvent.change(screen.getByLabelText(`${kind} ${i + 1} coins`), {
      target: { value: String(clue.coins) },
    });
    fireEvent.change(screen.getByLabelText(`${kind} ${i + 1} Voltorbs`), {
      target: { value: String(clue.voltorbs) },
    });
  }
}

describe("solver page metadata", () => {
  it("leaves openGraph.images and twitter.images unset so the file-based card applies", () => {
    // Even `images: undefined` blocks Next's opengraph-image.tsx.
    expect(Object.hasOwn(metadata.openGraph ?? {}, "images")).toBe(false);
    expect(Object.hasOwn(metadata.twitter ?? {}, "images")).toBe(false);
  });
});

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

  it("keeps focus on the last Voltorb box instead of wrapping to the first clue", () => {
    render(<SolverClient />);
    const last = screen.getByLabelText("Column 5 Voltorbs");
    last.focus();
    fireEvent.change(last, { target: { value: "1" } });
    expect(document.activeElement).toBe(last);
  });

  it("marks one best tile, names it in the tile label and in the status line", () => {
    render(<SolverClient />);
    fillBoardClues(generateLayout(12, mulberry32(3)));
    const flipNext = screen.getAllByRole("button", { name: /Flip next/ });
    expect(flipNext).toHaveLength(1);
    const match = /^Row (\d), column (\d):/.exec(flipNext[0]?.getAttribute("aria-label") ?? "");
    expect(match).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      `Best next tile: row ${match?.[1]}, column ${match?.[2]}.`,
    );
  });

  it("recomputes when a tile is flipped", () => {
    render(<SolverClient />);
    const cells = generateLayout(12, mulberry32(3));
    fillBoardClues(cells);
    const before = screen.getByRole("status").textContent;
    // Flip a tile that really holds a 3: 1, 2, 3.
    const i = cells.indexOf(3);
    const tile = screen.getByRole("button", {
      name: new RegExp(`^Row ${Math.floor(i / 5) + 1}, column ${(i % 5) + 1}:`),
    });
    fireEvent.click(tile);
    fireEvent.click(tile);
    fireEvent.click(tile);
    expect(tile.getAttribute("aria-label")).toContain("Flipped as 3");
    expect(screen.getByRole("status").textContent).not.toBe(before);
  });

  it("clears every box and tile", () => {
    render(<SolverClient />);
    fillAllOnes();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("status").textContent).toContain("Enter all ten clues");
    expect((screen.getByLabelText("Row 1 coins") as HTMLInputElement).value).toBe("");
  });
});
