import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FloorView } from "../floor-view";
import { towerFrames } from "./frames";

afterEach(cleanup);

const walk = { name: "walk", direction: null } as const;

describe("FloorView", () => {
  it("draws one glyph per unit, by kind", () => {
    // Narrow Path 3: the knight and four sludges.
    const [start] = towerFrames("narrow-path", 3, []);
    const { container } = render(<FloorView frame={start!} label="Floor 3 of The Narrow Path" />);
    const kinds = [...container.querySelectorAll("[data-glyph]")].map((el) =>
      el.getAttribute("data-glyph"),
    );
    expect(kinds.filter((kind) => kind === "knight")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "sludge")).toHaveLength(4);
    expect(kinds).toHaveLength(5);
  });

  it("draws every kind of unit the two towers hold", () => {
    const seen = new Set<string | null>();
    for (const tower of ["narrow-path", "powder-keep"] as const) {
      for (let level = 1; level <= 9; level += 1) {
        const [start] = towerFrames(tower, level, [], true);
        const { container } = render(<FloorView frame={start!} label="x" />);
        container
          .querySelectorAll("[data-glyph]")
          .forEach((el) => seen.add(el.getAttribute("data-glyph")));
        cleanup();
      }
    }
    expect([...seen].sort()).toEqual(
      ["archer", "captive", "knight", "sludge", "thick-sludge", "wizard"].sort(),
    );
  });

  it("keeps a unit's id stable between two events", () => {
    const frames = towerFrames("narrow-path", 1, [walk, walk]);
    const ids = (index: number) => {
      cleanup();
      const { container } = render(<FloorView frame={frames[index]!} label="x" />);
      return [...container.querySelectorAll("[data-unit-id]")].map((el) =>
        el.getAttribute("data-unit-id"),
      );
    };
    expect(ids(0)).toEqual(ids(frames.length - 1));
  });

  it("moves a unit by transform so a step can animate", () => {
    const frames = towerFrames("narrow-path", 1, [walk]);
    const position = (index: number) => {
      cleanup();
      const { container } = render(<FloorView frame={frames[index]!} label="x" />);
      return container.querySelector<SVGGElement>('[data-unit-id="0"]')?.style.transform;
    };
    expect(position(0)).not.toBe(position(frames.length - 1));
  });

  it("shows the chain on a bound captive and the countdown on a ticking one", () => {
    const [start] = towerFrames("powder-keep", 6, []);
    const { container } = render(<FloorView frame={start!} label="x" />);
    expect(container.querySelectorAll("[data-chain]").length).toBeGreaterThanOrEqual(2);
    const ticking = container.querySelector("[data-ticking]");
    expect(ticking?.textContent).toBe("7");
  });

  it("has no chain on a freed captive", () => {
    const [start] = towerFrames("powder-keep", 6, []);
    const frame = {
      ...start!,
      floor: {
        ...start!.floor,
        units: start!.floor.units.map((unit) => ({ ...unit, bound: false })),
      },
    };
    const { container } = render(<FloorView frame={frame} label="x" />);
    expect(container.querySelectorAll("[data-chain]")).toHaveLength(0);
  });

  it("scales the health bar to the unit's health", () => {
    const frames = towerFrames("narrow-path", 3, [walk, { name: "attack", direction: "forward" }]);
    const { container } = render(<FloorView frame={frames[0]!} label="x" />);
    const full = container.querySelector('[data-unit-id="0"] [data-health]');
    expect(full?.getAttribute("data-health")).toBe("1");
    const hurt = {
      ...frames[0]!,
      floor: {
        ...frames[0]!.floor,
        units: frames[0]!.floor.units.map((u) => (u.warrior ? { ...u, health: 5 } : u)),
      },
    };
    cleanup();
    const second = render(<FloorView frame={hurt} label="x" />);
    expect(
      second.container
        .querySelector('[data-unit-id="0"] [data-health]')
        ?.getAttribute("data-health"),
    ).toBe("0.25");
  });

  it("turns a unit's glyph to face the way it faces", () => {
    const [start] = towerFrames("narrow-path", 1, []);
    const facing = (dir: "east" | "west" | "north" | "south") => {
      cleanup();
      const frame = {
        ...start!,
        floor: {
          ...start!.floor,
          units: start!.floor.units.map((u) => ({ ...u, facing: dir })),
        },
      };
      const { container } = render(<FloorView frame={frame} label="x" />);
      const glyph = container.querySelector('[data-unit-id="0"] [data-facing]');
      expect(glyph?.getAttribute("data-facing")).toBe(dir);
      return glyph?.firstElementChild?.getAttribute("transform");
    };
    expect(facing("east")).toBe("rotate(0 5 5)");
    expect(facing("south")).toBe("rotate(90 5 5)");
    expect(facing("west")).toBe("rotate(180 5 5)");
    expect(facing("north")).toBe("rotate(270 5 5)");
  });

  it("summarises the floor for assistive technology", () => {
    const [start] = towerFrames("narrow-path", 3, []);
    render(<FloorView frame={start!} label="Floor 3 of The Narrow Path" />);
    const img = screen.getByRole("img");
    const label = img.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/^Floor 3 of The Narrow Path:/);
    expect(label).toContain("Knight at 1");
    expect(label).toContain("Sludge at 3");
    expect(label).toMatch(/stairs at \d+/);
  });

  it("sizes the view box to the floor and its wall ring", () => {
    const [start] = towerFrames("narrow-path", 1, []);
    const { container } = render(<FloorView frame={start!} label="x" />);
    const { width, height } = start!.floor;
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe(
      `0 0 ${(width + 2) * 10} ${(height + 2) * 10}`,
    );
  });
});
