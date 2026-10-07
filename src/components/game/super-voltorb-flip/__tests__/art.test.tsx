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
