import { afterEach, describe, expect, it, vi } from "vitest";
import { followRule } from "../follow-rule";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/** A scroller (overflow auto) holding a card; layout offsets are mocked, transforms are not in them. */
function setup(opts: { animating: boolean; cardTop: number; scrollTop: number }) {
  const scroller = document.createElement("div");
  const card = document.createElement("div");
  scroller.appendChild(card);
  document.body.appendChild(scroller);
  Object.defineProperty(scroller, "clientHeight", { value: 300 });
  Object.defineProperty(scroller, "scrollTop", { value: opts.scrollTop, writable: true });
  Object.defineProperty(card, "offsetHeight", { value: 100 });
  Object.defineProperty(card, "offsetTop", { value: opts.cardTop });
  Object.defineProperty(scroller, "offsetTop", { value: 0 });
  const scrollTo = vi.fn();
  scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
  const scrollIntoView = vi.fn();
  card.scrollIntoView = scrollIntoView;
  card.getAnimations = (() => (opts.animating ? [{}] : [])) as unknown as Element["getAnimations"];
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const cs = real(el);
    return el === scroller ? ({ overflowY: "auto" } as CSSStyleDeclaration) : cs;
  });
  return { scroller, card, scrollTo, scrollIntoView };
}

describe("followRule", () => {
  it("scrolls smoothly to the rule when nothing is animating", () => {
    const { card, scrollIntoView } = setup({ animating: false, cardTop: 0, scrollTop: 0 });
    followRule(card);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("while the card animates, the target comes from layout, not the transformed rect", () => {
    const { card, scrollTo, scrollIntoView } = setup({
      animating: true,
      cardTop: 500,
      scrollTop: 0,
    });
    // The painted rect is wildly off mid-FLIP; the target must ignore it.
    card.getBoundingClientRect = () => ({ top: -999, bottom: -899 }) as DOMRect;
    followRule(card);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({ top: 300, behavior: "smooth" }); // 500 + 100 - 300
  });

  it("does not scroll when the rule already sits inside the scroller", () => {
    const { card, scrollTo } = setup({ animating: true, cardTop: 50, scrollTop: 0 });
    followRule(card);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
