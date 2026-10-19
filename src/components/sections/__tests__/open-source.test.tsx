import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { OpenSource } from "../open-source";

function markup(): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = renderToString(<OpenSource />);
  return host;
}

describe("OpenSource motion", () => {
  it("renders the contribution cell hover ring with no transition", () => {
    const cells = Array.from(markup().querySelectorAll<HTMLElement>("div.cursor-pointer"));
    expect(cells.length).toBe(364);
    for (const cell of cells) {
      expect(cell.classList.contains("hover:ring-1")).toBe(true);
      expect(cell.classList.contains("transition-shadow")).toBe(false);
      expect(cell.classList.contains("transition-all")).toBe(false);
      expect(cell.classList.contains("transition")).toBe(false);
    }
  });

  it("gates the card arrow nudge behind motion-safe and names its transition", () => {
    const arrow = Array.from(markup().querySelectorAll<SVGElement>("svg")).find((svg) =>
      svg.classList.contains("transition-[color,translate]"),
    );
    expect(arrow).toBeDefined();
    expect(arrow?.classList.contains("motion-safe:group-hover:translate-x-1")).toBe(true);
    expect(arrow?.classList.contains("group-hover:translate-x-1")).toBe(false);
  });
});
