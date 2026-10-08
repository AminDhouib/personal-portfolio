import { afterEach, describe, expect, it, vi } from "vitest";
import { followRule } from "../follow-rule";

const real = window.getComputedStyle.bind(window);

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

  it("a different in-flight transform does not move the scroll target", () => {
    const target = (paintedTop: number) => {
      const { card, scrollTo } = setup({ animating: true, cardTop: 500, scrollTop: 0 });
      card.getBoundingClientRect = () => ({ top: paintedTop, bottom: paintedTop + 100 }) as DOMRect;
      followRule(card);
      const call = scrollTo.mock.calls[0] as [{ top: number }] | undefined;
      document.body.innerHTML = "";
      return call?.[0].top;
    };
    expect(target(-300)).toBe(300);
    expect(target(900)).toBe(300);
  });

  it("scrolls every scroller up to the sheet when the card is below both folds", () => {
    const sheet = document.createElement("div");
    const list = document.createElement("div");
    const card = document.createElement("div");
    sheet.appendChild(list);
    list.appendChild(card);
    document.body.appendChild(sheet);
    const def = (el: HTMLElement, props: Record<string, number>) => {
      for (const [k, value] of Object.entries(props)) {
        Object.defineProperty(el, k, { value, writable: true, configurable: true });
      }
    };
    // offsetParent is null in jsdom, so these offsets are already document-relative.
    def(sheet, { offsetTop: 0, clientHeight: 450, scrollTop: 0 });
    def(list, { offsetTop: 400, clientHeight: 128, scrollTop: 0 });
    def(card, { offsetTop: 700, offsetHeight: 86 });
    const sheetTo = vi.fn();
    const listTo = vi.fn();
    sheet.scrollTo = sheetTo as unknown as typeof sheet.scrollTo;
    list.scrollTo = listTo as unknown as typeof list.scrollTo;
    card.getAnimations = (() => [{}]) as unknown as Element["getAnimations"];
    card.scrollIntoView = vi.fn();
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) =>
      el === sheet || el === list ? ({ overflowY: "auto" } as CSSStyleDeclaration) : real(el),
    );
    followRule(card);
    // List: card spans 300-386 in its content, visible height 128 -> scroll to 258.
    expect(listTo).toHaveBeenCalledWith({ top: 258, behavior: "smooth" });
    // Sheet: after that the card sits at 442-528 in the sheet, visible height 450 -> 78.
    expect(sheetTo).toHaveBeenCalledWith({ top: 78, behavior: "smooth" });
  });

  it("does not scroll when the rule already sits inside the scroller", () => {
    const { card, scrollTo } = setup({ animating: true, cardTop: 50, scrollTop: 0 });
    followRule(card);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
