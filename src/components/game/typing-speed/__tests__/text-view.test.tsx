import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyOp, createRun } from "../engine/run";
import type { TypingRun } from "../engine/types";
import { TextView } from "../text-view";

let perLine = 3;
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");

// Three words per line, 30 px apart.
beforeEach(() => {
  perLine = 3;
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      const i = this.getAttribute("data-ts-word");
      return i === null ? 0 : Math.floor(Number(i) / perLine) * 30;
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (original) Object.defineProperty(HTMLElement.prototype, "offsetTop", original);
});

function runAt(wordsDone: number): TypingRun {
  const text = Array.from({ length: 12 }, (_, i) => `w${String(i).padStart(2, "0")}`).join(" ");
  const run = createRun({ kind: "text", text });
  let t = 0;
  for (let i = 0; i < wordsDone; i++) {
    for (const ch of run.words[i]!) applyOp(run, { kind: "char", ch }, t++);
    applyOp(run, { kind: "space" }, t++);
  }
  return run;
}

/** Lets the view's frame callback run. */
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

const rendered = () =>
  [...document.querySelectorAll("[data-ts-word]")].map((e) => e.getAttribute("data-ts-word"));

describe("TextView three-line window", () => {
  it("shows every word while the cursor is on the first two lines", () => {
    render(<TextView run={runAt(4)} caret />);
    expect(rendered()).toHaveLength(12);
  });
  it("drops the first line's words when the cursor reaches the third line", async () => {
    render(<TextView run={runAt(6)} caret />);
    await frame();
    expect(rendered()).toEqual(["3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  });
  it("keeps the full text for screen readers", () => {
    const { container } = render(<TextView run={runAt(6)} caret />);
    expect(container.querySelector(".sr-only")?.textContent).toBe(runAt(0).words.join(" "));
  });
  it("shows the first words of a fresh run", () => {
    render(<TextView run={runAt(0)} caret />);
    expect(rendered()[0]).toBe("0");
  });

  it("measures again when the box is resized and disconnects on unmount", async () => {
    let notify: () => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          notify = cb;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const { unmount } = render(<TextView run={runAt(4)} caret />);
    await frame();
    expect(rendered()).toHaveLength(12);
    // The box narrows to two words per line: word 4 is now on the third line.
    perLine = 2;
    act(() => notify());
    await frame();
    expect(rendered()[0]).toBe("2");
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
  it("lets an overlong word wrap instead of clipping", () => {
    const run = createRun({ kind: "text", text: "a ".concat("x".repeat(80)) });
    const { container } = render(<TextView run={run} caret />);
    const word = container.querySelector("[data-ts-word='1'] > span");
    expect(word).toHaveClass("max-w-full", "break-words");
  });
});
