import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypingSpeedGame } from "../../typing-speed";
import { SENTINEL as S } from "../engine/input";

vi.mock("../engine/text", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/text")>()),
  passageAt: () => ({ id: "t-1", source: "austen-pp", text: "ab cd" }),
}));

let clock = 0;
const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

function getInput(): HTMLInputElement {
  return screen.getByLabelText("Typing area") as HTMLInputElement;
}

/** Sets the value the way a browser does (bypassing React) and fires an input event. */
function setValue(input: HTMLInputElement, value: string, inputType = "insertText") {
  act(() => {
    valueSetter.call(input, value);
    input.dispatchEvent(new InputEvent("input", { inputType, bubbles: true }));
  });
}

function typeKey(ch: string, at: number) {
  clock = at;
  const input = getInput();
  setValue(input, input.value + ch);
}

function backspace(at: number) {
  clock = at;
  const input = getInput();
  setValue(input, input.value.slice(0, -1), "deleteContentBackward");
}

beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("Typing Speed on the engine", () => {
  it("shows the text unblurred at rest and every button is sans (audit bug 7)", () => {
    const { container } = render(<TypingSpeedGame />);
    const visual = screen.getByTestId("ts-target").querySelector("[data-ts-visual]");
    expect(visual?.textContent).toBe("ab cd");
    expect(container.querySelector("[class*='backdrop-blur']")).toBeNull();
    for (const b of screen.getAllByRole("button")) expect(b).toHaveClass("font-sans");
  });

  it("an honest run: 5 characters over 480 ms is 125 WPM at 100% (audit bug 2)", () => {
    render(<TypingSpeedGame />);
    typeKey("a", 0);
    typeKey("b", 120);
    typeKey(" ", 240);
    typeKey("c", 360);
    typeKey("d", 480);
    expect(screen.getByTestId("ts-net-wpm")).toHaveTextContent("125");
    expect(screen.getByTestId("ts-accuracy")).toHaveTextContent("100%");
    expect(screen.getByTestId("ts-mistakes")).toHaveTextContent("0 mistakes typed, 0 left");
  });

  it("a corrected slip still costs accuracy and is reported (audit bug 1)", () => {
    render(<TypingSpeedGame />);
    typeKey("a", 0);
    typeKey("x", 100);
    backspace(200);
    typeKey("b", 300);
    typeKey(" ", 400);
    typeKey("c", 500);
    typeKey("d", 600);
    expect(screen.getByTestId("ts-accuracy")).toHaveTextContent("83%");
    expect(screen.getByTestId("ts-mistakes")).toHaveTextContent("1 mistake typed, 0 left");
  });

  it("refuses paste, drop and pasted input (audit bug 6)", () => {
    render(<TypingSpeedGame />);
    const input = getInput();
    const before = new InputEvent("beforeinput", {
      inputType: "insertFromPaste",
      cancelable: true,
      bubbles: true,
    });
    input.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(true);
    const paste = new Event("paste", { cancelable: true, bubbles: true });
    input.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    const drop = new Event("drop", { cancelable: true, bubbles: true });
    input.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);

    typeKey("a", 0);
    setValue(input, S + "a pasted text", "insertFromPaste");
    expect(input.value).toBe(S + "a");
    expect(document.querySelectorAll("[data-state='wrong'], [data-state='extra']")).toHaveLength(0);
  });

  it("rewrites the input only when it differs from the engine view", () => {
    render(<TypingSpeedGame />);
    const input = getInput();
    const writes: string[] = [];
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () =>
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.get!.call(input),
      set: (v: string) => {
        writes.push(v);
        valueSetter.call(input, v);
      },
    });
    typeKey("a", 0);
    expect(writes).toEqual([]);
    setValue(input, S + "a pasted", "insertFromPaste");
    expect(writes).toEqual([S + "a"]);
  });

  it("writes typing-high-score only for a non-bulk run that beats it", () => {
    window.localStorage.setItem("typing-high-score", "100");
    render(<TypingSpeedGame />);
    typeKey("a", 0);
    typeKey("b", 120);
    typeKey(" ", 240);
    typeKey("c", 360);
    typeKey("d", 480);
    expect(window.localStorage.getItem("typing-high-score")).toBe("125");
    expect(screen.getByText("New best!")).toBeInTheDocument();
  });

  it("keeps a higher stored best", () => {
    window.localStorage.setItem("typing-high-score", "200");
    render(<TypingSpeedGame />);
    typeKey("a", 0);
    typeKey("b", 120);
    typeKey(" ", 240);
    typeKey("c", 360);
    typeKey("d", 480);
    expect(window.localStorage.getItem("typing-high-score")).toBe("200");
  });

  it("a run with a bulk insert never writes a best and shows the suggestions note", () => {
    window.localStorage.setItem("typing-high-score", "50");
    render(<TypingSpeedGame />);
    const input = getInput();
    clock = 0;
    setValue(input, S + "ab");
    typeKey(" ", 120);
    typeKey("c", 240);
    typeKey("d", 360);
    expect(window.localStorage.getItem("typing-high-score")).toBe("50");
    expect(screen.getByText(/keyboard suggestions/i)).toBeInTheDocument();
    expect(screen.queryByText("New best!")).toBeNull();
  });

  it("any printable key with focus on the body starts the run and counts as the first key", () => {
    render(<TypingSpeedGame />);
    document.body.focus();
    clock = 0;
    fireEvent.keyDown(document.body, { key: "a" });
    expect(document.activeElement).toBe(getInput());
    expect(getInput().value).toBe(S + "a");
    typeKey("b", 120);
    typeKey(" ", 240);
    typeKey("c", 360);
    typeKey("d", 480);
    expect(screen.getByTestId("ts-net-wpm")).toHaveTextContent("125");
  });

  it("Enter focuses the input without typing; Escape restarts a running round", () => {
    render(<TypingSpeedGame />);
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(document.activeElement).toBe(getInput());
    expect(getInput().value).toBe(S);
    expect(document.querySelectorAll("[data-state='correct']")).toHaveLength(0);

    typeKey("a", 0);
    expect(document.querySelectorAll("[data-state='correct']")).toHaveLength(1);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(getInput().value).toBe(S);
    expect(document.querySelectorAll("[data-state='correct']")).toHaveLength(0);
  });

  it("a keydown whose target is not an Element does not throw", () => {
    render(<TypingSpeedGame />);
    expect(() => fireEvent.keyDown(window, { key: "Enter" })).not.toThrow();
    expect(() => fireEvent.keyDown(document, { key: "x" })).not.toThrow();
  });
});
