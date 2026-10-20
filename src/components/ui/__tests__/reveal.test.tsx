import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { render, screen, act } from "@testing-library/react";
import { Reveal } from "../reveal";
import { Services } from "@/components/sections/services";
import { Contact } from "@/components/sections/contact";
import { BeyondCode } from "@/components/sections/beyond-code";
import { Background } from "@/components/sections/background";
import { ProofBar } from "@/components/sections/proof-bar";
import { ReviewsClient } from "@/app/reviews/reviews-client";

describe("Reveal server HTML", () => {
  it("renders content with no hidden state and no inline opacity or transform", () => {
    const html = renderToString(
      <Reveal as="li" y={24} className="card">
        Real content
      </Reveal>,
    );
    expect(html).toContain("Real content");
    expect(html).toContain("<li");
    expect(html).not.toContain("data-reveal");
    expect(html).not.toMatch(/opacity\s*:\s*0(?![.\d])/);
    expect(html).not.toMatch(/transform\s*:/);
  });

  it.each([
    ["Services", <Services key="s" />],
    ["Contact", <Contact key="c" />],
    ["BeyondCode", <BeyondCode key="b" />],
    ["Background", <Background key="bg" />],
    ["ProofBar", <ProofBar key="p" usersK={200} />],
    ["ReviewsClient", <ReviewsClient key="r" />],
  ])("%s section is not hidden in the server HTML", (_name, element) => {
    const html = renderToString(element);
    expect(html).not.toContain("data-reveal");
    expect(html).not.toMatch(/opacity\s*:\s*0(?![.\d])/);
    expect(html).not.toMatch(/transform\s*:\s*translate/);
  });
});

describe("Reveal on the client", () => {
  let fireIntersect: ((isIntersecting: boolean) => void) | null = null;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fireIntersect = null;
  });

  function stubEnvironment({ reduced }: { reduced: boolean }) {
    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn(function (this: object, callback: IntersectionObserverCallback) {
        let target: Element | null = null;
        fireIntersect = (isIntersecting) => {
          if (!target) return;
          callback(
            [{ isIntersecting, target } as unknown as IntersectionObserverEntry],
            this as IntersectionObserver,
          );
        };
        Object.assign(this, {
          observe: (el: Element) => {
            target = el;
          },
          unobserve: () => undefined,
          disconnect: () => undefined,
        });
      }),
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: reduced && query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
  }

  function placeBelowFold() {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: window.innerHeight + 400,
    } as DOMRect);
  }

  it("arms an element that starts below the fold, then plays once when it scrolls in", () => {
    stubEnvironment({ reduced: false });
    placeBelowFold();
    render(<Reveal y={20}>Below</Reveal>);
    const el = screen.getByText("Below");
    expect(el.dataset.reveal).toBe("armed");

    act(() => fireIntersect?.(true));
    expect(el.dataset.reveal).toBe("shown");
  });

  it("drops the armed state on unmount so a re-run never strands a hidden node", () => {
    stubEnvironment({ reduced: false });
    placeBelowFold();
    const { unmount } = render(<Reveal y={20}>Unmounted</Reveal>);
    const el = screen.getByText("Unmounted");
    expect(el.dataset.reveal).toBe("armed");
    unmount();
    expect(el.dataset.reveal).toBeUndefined();
  });

  it("leaves an element that is already on screen visible and unarmed", () => {
    stubEnvironment({ reduced: false });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
    } as DOMRect);
    render(<Reveal y={20}>Above</Reveal>);
    expect(screen.getByText("Above").dataset.reveal).toBeUndefined();
  });

  it("arms nothing under prefers-reduced-motion", () => {
    stubEnvironment({ reduced: true });
    placeBelowFold();
    render(<Reveal y={20}>Reduced</Reveal>);
    expect(screen.getByText("Reduced").dataset.reveal).toBeUndefined();
    expect(fireIntersect).toBeNull();
  });
});
