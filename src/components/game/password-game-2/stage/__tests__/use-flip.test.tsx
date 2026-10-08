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

describe("useFlip", () => {
  it("is a no-op where Element.animate is missing (jsdom)", () => {
    const { rerender } = render(<Harness order={["a", "b"]} />);
    expect(() => rerender(<Harness order={["b", "a"]} />)).not.toThrow();
  });

  it("animates moved children with the inverse transform", () => {
    const animate = vi.fn();
    Element.prototype.animate = animate as unknown as Element["animate"];
    let top = 0;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const id = this.getAttribute("data-flip-id");
      const t = id === "a" ? top : id === "b" ? 60 - top : 0;
      return {
        top: t,
        bottom: t + 60,
        left: 0,
        right: 0,
        width: 0,
        height: 60,
        x: 0,
        y: t,
        toJSON() {},
      };
    });
    const { rerender } = render(<Harness order={["a", "b"]} />);
    expect(animate).not.toHaveBeenCalled(); // the first layout only records
    top = 60; // a moves down, b moves up
    rerender(<Harness order={["b", "a"]} />);
    expect(animate).toHaveBeenCalledTimes(2);
    const frames = animate.mock.calls[0]![0] as Keyframe[];
    expect(frames[0]!.transform).toMatch(/translateY\(/);
  });

  it("does not animate when the order key is unchanged", () => {
    const animate = vi.fn();
    Element.prototype.animate = animate as unknown as Element["animate"];
    const { rerender } = render(<Harness order={["a", "b"]} />);
    rerender(<Harness order={["a", "b"]} />);
    expect(animate).not.toHaveBeenCalled();
  });
});
