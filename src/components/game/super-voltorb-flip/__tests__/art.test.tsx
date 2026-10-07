import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PixelSprite } from "../art/pixel-sprite";
import { BurstFrame, CoinFrame, SparkleFrame } from "../art/frames";
import { ORB } from "../art/sprites";

afterEach(cleanup);

describe("PixelSprite", () => {
  it("renders an aria-hidden crisp-edged SVG sized to the sprite grid", () => {
    const { container } = render(<PixelSprite sprite={ORB} size={22} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 11 11");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("shape-rendering")).toBe("crispEdges");
    expect(svg.getAttribute("width")).toBe("22");
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(3);
  });

  it("takes a CSS size instead of attribute sizes", () => {
    const { container } = render(
      <PixelSprite sprite={ORB} cssSize="calc(var(--svf-tile) * 0.95)" />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBeNull();
    expect(svg.style.width).toContain("var(--svf-tile)");
  });

  it("passes className and colour through for glyph ink", () => {
    const { container } = render(
      <PixelSprite sprite={ORB} size={10} className="voltorb" style={{ color: "#fff" }} />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.classList.contains("voltorb")).toBe(true);
    expect(svg.style.color).toBe("rgb(255, 255, 255)");
  });
});

describe("PixelSprite outline and layout", () => {
  it("outlines the silhouette: a stroked underlay group, unstroked fills on top", () => {
    const { container } = render(
      <PixelSprite sprite={ORB} size={10} outline="#1f2937" style={{ color: "#fff" }} />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.style.overflow).toBe("visible");
    const underlay = svg.querySelector("g[data-outline]")!;
    const underPaths = [...underlay.querySelectorAll("path")];
    expect(underPaths.length).toBeGreaterThan(3);
    for (const p of underPaths) {
      expect(p.getAttribute("stroke")).toBe("#1f2937");
      expect(p.getAttribute("fill")).toBe("#1f2937");
    }
    // The colour layers come after the underlay and carry no stroke, so no
    // internal colour boundary is outlined.
    const fills = [...svg.querySelectorAll("path")].filter((p) => !underlay.contains(p));
    expect(fills.length).toBe(underPaths.length);
    for (const p of fills) expect(p.getAttribute("stroke")).toBeNull();
    expect(
      underlay.compareDocumentPosition(fills[0]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("draws no stroke without an outline", () => {
    const { container } = render(<PixelSprite sprite={ORB} size={10} />);
    expect(container.querySelector("svg path")!.getAttribute("stroke")).toBeNull();
  });

  it("never shrinks as a flex child", () => {
    const { container } = render(<PixelSprite sprite={ORB} size={10} />);
    expect(container.querySelector("svg")!.style.flexShrink).toBe("0");
  });
});

describe("frame components", () => {
  it("BurstFrame draws a rect per geometry entry, and the orb core only when asked", () => {
    const bare = render(<BurstFrame frame={4} size={64} />);
    const rects = bare.container.querySelectorAll("rect").length;
    expect(rects).toBeGreaterThan(8);
    expect(bare.container.querySelectorAll("path")).toHaveLength(0);
    cleanup();
    const withCore = render(<BurstFrame frame={4} size={64} core />);
    expect(withCore.container.querySelectorAll("path").length).toBeGreaterThan(3);
  });

  it("SparkleFrame and CoinFrame render SVG with no <img>", () => {
    const a = render(<SparkleFrame frame={1} size={32} />);
    expect(a.container.querySelector("svg")).not.toBeNull();
    expect(a.container.querySelector("img")).toBeNull();
    cleanup();
    const b = render(<CoinFrame frame={0} size={28} />);
    expect(b.container.querySelector("svg ellipse")).not.toBeNull();
    expect(b.container.querySelector("img")).toBeNull();
  });
});
