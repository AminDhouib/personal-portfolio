import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SENTINEL } from "../engine/input";
import { RainGame } from "../rain-view";
import { fakeVV, restoreViewport } from "./phone-helpers";

let clock = 0;
let nextId = 0;
const pending = new Map<number, FrameRequestCallback>();
const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

/** Runs the frames that are queued now, 50 ms of the stubbed clock later. */
function frame(ms = 50) {
  clock += ms;
  const callbacks = [...pending.values()];
  pending.clear();
  act(() => callbacks.forEach((cb) => cb(clock)));
}

function frames(n: number) {
  for (let i = 0; i < n; i++) frame();
}

function input(): HTMLInputElement {
  return screen.getByLabelText("Typing area") as HTMLInputElement;
}

function setValue(value: string, inputType = "insertText") {
  act(() => {
    valueSetter.call(input(), value);
    input().dispatchEvent(new InputEvent("input", { inputType, bubbles: true }));
  });
}

/** Types letters one at a time, the way a hardware keyboard does. */
function typeText(text: string) {
  for (const ch of text) setValue(input().value + ch);
}

function start() {
  act(() => input().focus());
}

function words(): HTMLElement[] {
  return screen.queryAllByTestId("ts-rain-word");
}

function renderRain() {
  return render(<RainGame header={null} phone={false} nextSeed={() => 11} />);
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  clock = 1000;
  nextId = 0;
  pending.clear();
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending.set(++nextId, cb);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    pending.delete(id);
  });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "visibilityState");
  restoreViewport();
});

describe("Word Rain view", () => {
  it("waits for focus, then draws falling words where the engine puts them", () => {
    renderRain();
    expect(words()).toHaveLength(0);
    expect(screen.getByTestId("ts-rain-pause")).toHaveTextContent("Click or press a key to start");
    start();
    frames(2);
    const [word] = words();
    expect(word).toBeDefined();
    const x = Number(word!.dataset.x);
    const y = Number(word!.dataset.y);
    expect(x).toBeGreaterThanOrEqual(0.05);
    expect(x).toBeLessThanOrEqual(0.75);
    // 100 ms at 0.08 of the area a second, plus the first tick.
    expect(y).toBeCloseTo(0.008, 3);
    expect(parseFloat(word!.style.left)).toBeCloseTo(x * 100, 1);
    expect(parseFloat(word!.style.top)).toBeCloseTo(y * 100, 1);
    expect(word).toHaveClass("absolute");
    expect(screen.queryByTestId("ts-rain-pause")).toBeNull();
  });

  it("clears a falling word typed through the hidden input and resets the input", () => {
    renderRain();
    start();
    frames(2);
    const text = words()[0]!.textContent!;
    typeText(text);
    expect(words().find((w) => w.textContent === text)).toBeUndefined();
    expect(input().value).toBe(SENTINEL);
    expect(screen.getByTestId("ts-rain-score")).toHaveTextContent(String(text.length));
  });

  it("clears a word that arrives in one event, as a phone suggestion does", () => {
    renderRain();
    start();
    frames(2);
    const text = words()[0]!.textContent!;
    setValue(SENTINEL + text);
    expect(screen.getByTestId("ts-rain-score")).toHaveTextContent(String(text.length));
    expect(input().value).toBe(SENTINEL);
  });

  it("echoes the buffer, and a wrong letter shakes it and counts as a miss", () => {
    renderRain();
    start();
    frames(2);
    const text = words()[0]!.textContent!;
    typeText(text.slice(0, 1));
    expect(screen.getByTestId("ts-rain-echo")).toHaveTextContent(text.slice(0, 1));
    expect(screen.getByTestId("ts-rain-echo")).not.toHaveClass("ts-rain-shake");
    typeText("!");
    expect(screen.getByTestId("ts-rain-echo")).toHaveClass("ts-rain-shake");
    expect(screen.getByTestId("ts-rain-area")).toHaveAttribute("data-missed", "1");
    // Backspace edits the buffer back to something valid.
    setValue(input().value.slice(0, -1), "deleteContentBackward");
    expect(screen.getByTestId("ts-rain-echo")).not.toHaveClass("ts-rain-shake");
    expect(screen.getByTestId("ts-rain-echo")).toHaveTextContent(text.slice(0, 1));
  });

  it("Space clears the buffer", () => {
    renderRain();
    start();
    frames(2);
    typeText(words()[0]!.textContent!.slice(0, 1));
    expect(screen.getByTestId("ts-rain-echo").textContent).not.toBe("");
    setValue(input().value + " ");
    expect(input().value).toBe(SENTINEL);
    expect(screen.getByTestId("ts-rain-echo").textContent).toBe("");
  });

  it("Enter clears the buffer", () => {
    renderRain();
    start();
    frames(2);
    typeText(words()[0]!.textContent!.slice(0, 1));
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(input().value).toBe(SENTINEL);
    expect(screen.getByTestId("ts-rain-echo").textContent).toBe("");
  });

  it("shows the lives, and three missed words end the run with the game-over card", () => {
    renderRain();
    expect(screen.getByLabelText("Lives: 3")).toBeInTheDocument();
    start();
    // 12.5 s for the first word to land; the next two follow at 2.4 s intervals.
    frames(260);
    expect(screen.getByLabelText("Lives: 2")).toBeInTheDocument();
    expect(screen.queryByTestId("ts-rain-over")).toBeNull();
    frames(100);
    expect(screen.getByTestId("ts-rain-over")).toBeInTheDocument();
    expect(screen.getByLabelText("Lives: 0")).toBeInTheDocument();
    expect(pending.size).toBe(0); // the loop stopped
  });

  it("pauses while the tab is hidden and takes up again without losing a life", () => {
    renderRain();
    start();
    frames(10);
    const before = words()[0]!.dataset.y;
    setVisibility("hidden");
    frames(400); // nothing is queued, so nothing moves
    expect(pending.size).toBe(0);
    expect(words()[0]!.dataset.y).toBe(before);
    expect(screen.getByLabelText("Lives: 3")).toBeInTheDocument();
    setVisibility("visible");
    frame();
    // One clamped step after the pause, not 20 s of fall.
    expect(Number(words()[0]!.dataset.y) - Number(before)).toBeLessThan(0.01);
  });

  it("pauses when the input loses focus and says how to carry on", () => {
    renderRain();
    start();
    frames(10);
    const before = words()[0]!.dataset.y;
    act(() => input().blur());
    expect(screen.getByTestId("ts-rain-pause")).toHaveTextContent("Tap to keep typing");
    frames(10);
    expect(words()[0]!.dataset.y).toBe(before);
    start();
    frames(1);
    expect(Number(words()[0]!.dataset.y)).toBeGreaterThan(Number(before));
  });

  it("cancels its frame on unmount", () => {
    const { unmount } = renderRain();
    start();
    frames(2);
    expect(pending.size).toBe(1);
    unmount();
    expect(pending.size).toBe(0);
  });

  it("Play again starts a fresh run with all lives", () => {
    renderRain();
    start();
    frames(360);
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(screen.getByLabelText("Lives: 3")).toBeInTheDocument();
    expect(screen.queryByTestId("ts-rain-over")).toBeNull();
    frames(2);
    expect(words().length).toBeGreaterThan(0);
  });

  it("on a phone the lives, the area and the echo sit in the sheet above the keyboard", () => {
    fakeVV(450);
    render(<RainGame header={<p>bar</p>} phone nextSeed={() => 11} />);
    expect(screen.queryByTestId("ts-sheet")).toBeNull();
    fireEvent.click(screen.getByTestId("ts-rain-area"));
    const sheet = screen.getByTestId("ts-sheet");
    expect(sheet.style.getPropertyValue("--ts-vv-h")).toBe("450px");
    expect(document.documentElement).toHaveClass("typing-lock");
    // The HUD carries the lives and the wave and stays one row of 44 px buttons.
    const hud = within(sheet).getByTestId("ts-hud");
    expect(within(hud).getByLabelText("Lives: 3")).toBeInTheDocument();
    expect(within(hud).getByTestId("ts-rain-wave")).toBeInTheDocument();
    for (const name of ["Restart", "Exit"]) {
      expect(within(hud).getByRole("button", { name })).toHaveClass("h-11", "w-11");
    }
    expect(within(sheet).getByTestId("ts-rain-area")).toBeInTheDocument();
    expect(within(sheet).getByTestId("ts-rain-echo")).toHaveClass("min-h-11");
    // The mode bar goes inert behind it, and Exit closes the sheet and the keyboard.
    expect(screen.getByText("bar").parentElement).toHaveAttribute("inert");
    fireEvent.click(within(hud).getByRole("button", { name: "Exit" }));
    expect(screen.queryByTestId("ts-sheet")).toBeNull();
    expect(document.documentElement).not.toHaveClass("typing-lock");
  });
});
