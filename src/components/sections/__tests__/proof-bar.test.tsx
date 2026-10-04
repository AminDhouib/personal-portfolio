import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { render, screen, act, waitFor } from "@testing-library/react";
import { ProofBar } from "../proof-bar";

/** Text content of server HTML with tags and React's text-separator comments removed. */
function serverText(html: string): string {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

describe("ProofBar server HTML", () => {
  it("carries the real figures, not the count-up's starting zeros", () => {
    const text = serverText(renderToString(<ProofBar usersK={200} />));
    expect(text).toContain("$ 1 M+");
    expect(text).toContain("50 +");
    expect(text).toContain("200 K+");
    expect(text).toContain("99.99 %");
    expect(text).not.toContain("$ 0 M+");
    expect(text).not.toMatch(/(^|\s)0 \+/);
  });
});

describe("ProofBar on the client", () => {
  let fireIntersect: ((isIntersecting: boolean) => void) | null = null;

  afterEach(() => {
    vi.unstubAllGlobals();
    fireIntersect = null;
  });

  function stubIntersectionObserver() {
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
  }

  it("resets to 0 after mount, then counts up to the figure once in view", async () => {
    stubIntersectionObserver();
    render(<ProofBar usersK={200} />);

    // Out of view after hydration: the count-up has not started, so it reads 0.
    // framer-motion writes the reset on its next animation frame (before the
    // browser's next paint; jsdom runs that frame on a timer, hence waitFor).
    const clients = screen.getByText("Clients").previousElementSibling;
    await waitFor(() => expect(clients?.textContent).toBe("0+"));

    act(() => fireIntersect?.(true));
    await waitFor(() => expect(clients?.textContent).toBe("50+"), { timeout: 4000 });
  });
});
