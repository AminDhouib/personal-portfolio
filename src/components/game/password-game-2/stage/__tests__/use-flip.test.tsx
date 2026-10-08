import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { useFlip } from "../use-flip";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(Element.prototype, "animate");
  vi.restoreAllMocks();
});

function Harness({ order }: { order: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, order.join(","));
  return (
    <div ref={ref}>
      {order.map((id) => (
        <div key={id} data-flip-id={id} />
      ))}
    </div>
  );
}

/** Layout tops by id, read through offsetTop; getBoundingClientRect is deliberately polluted. */
function mockLayout(tops: { current: Record<string, number> }, pollution = 0) {
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return tops.current[this.getAttribute("data-flip-id") ?? ""] ?? 0;
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const t = (tops.current[this.getAttribute("data-flip-id") ?? ""] ?? 0) + pollution;
    return { top: t, bottom: t, left: 0, right: 0, width: 0, height: 60, x: 0, y: t, toJSON() {} };
  });
}

describe("useFlip", () => {
  it("is a no-op where Element.animate is missing (jsdom)", () => {
    const { rerender } = render(<Harness order={["a", "b"]} />);
    expect(() => rerender(<Harness order={["b", "a"]} />)).not.toThrow();
  });

  it("animates moved children with the inverse transform", () => {
    const animate = vi.fn();
    Element.prototype.animate = animate as unknown as Element["animate"];
    const tops = { current: { a: 0, b: 60 } as Record<string, number> };
    mockLayout(tops);
    const { rerender } = render(<Harness order={["a", "b"]} />);
    expect(animate).not.toHaveBeenCalled(); // the first layout only records
    tops.current = { a: 60, b: 0 };
    rerender(<Harness order={["b", "a"]} />);
    expect(animate).toHaveBeenCalledTimes(2);
    const frames = animate.mock.calls[0]![0] as Keyframe[];
    expect(frames[0]!.transform).toMatch(/translateY\(/);
  });

  it("uses layout positions, not rects polluted by an in-flight transform", () => {
    const animate = vi.fn();
    Element.prototype.animate = animate as unknown as Element["animate"];
    const tops = { current: { a: 0, b: 60 } as Record<string, number> };
    mockLayout(tops, 37); // every rect reads 37px off, as under a running entrance
    const { rerender } = render(<Harness order={["a", "b"]} />);
    tops.current = { a: 60, b: 0 };
    rerender(<Harness order={["b", "a"]} />);
    const dys = animate.mock.calls.map((c) => (c[0] as Keyframe[])[0]!.transform);
    expect(dys.sort()).toEqual(["translateY(-60px)", "translateY(60px)"]);
  });

  it("animates a second reorder from where the first one left the cards", () => {
    const animate = vi.fn();
    Element.prototype.animate = animate as unknown as Element["animate"];
    const tops = { current: { a: 0, b: 60 } as Record<string, number> };
    mockLayout(tops);
    const { rerender } = render(<Harness order={["a", "b"]} />);
    tops.current = { a: 60, b: 0 };
    rerender(<Harness order={["b", "a"]} />);
    animate.mockClear();
    tops.current = { a: 0, b: 60 };
    rerender(<Harness order={["a", "b"]} />);
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("does not measure or animate when the order key is unchanged", () => {
    const animate = vi.fn();
    Element.prototype.animate = animate as unknown as Element["animate"];
    const tops = { current: { a: 0, b: 60 } as Record<string, number> };
    mockLayout(tops);
    const { rerender } = render(<Harness order={["a", "b"]} />);
    const offset = vi.spyOn(HTMLElement.prototype, "offsetTop", "get");
    offset.mockClear();
    rerender(<Harness order={["a", "b"]} />);
    expect(animate).not.toHaveBeenCalled();
    expect(offset).not.toHaveBeenCalled();
  });

  it("unmounting mid-animation is harmless", () => {
    const animate = vi.fn();
    Element.prototype.animate = animate as unknown as Element["animate"];
    const tops = { current: { a: 0, b: 60 } as Record<string, number> };
    mockLayout(tops);
    const { rerender, unmount } = render(<Harness order={["a", "b"]} />);
    tops.current = { a: 60, b: 0 };
    rerender(<Harness order={["b", "a"]} />);
    expect(() => unmount()).not.toThrow();
  });
});
