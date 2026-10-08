import { describe, it, expect } from "vitest";
import { hextrisKeyAction, type HexRunPhase } from "../input";

const k = (
  key: string,
  phase: HexRunPhase,
  extra: Partial<Parameters<typeof hextrisKeyAction>[0]> = {},
) =>
  hextrisKeyAction({
    key,
    phase,
    textEntry: false,
    onControl: false,
    modifier: false,
    repeat: false,
    ...extra,
  });

describe("hextrisKeyAction", () => {
  it("starts only on play keys, and claims them", () => {
    for (const key of [" ", "Enter", "ArrowLeft", "ArrowRight", "ArrowDown", "a", "d", "s"]) {
      expect(k(key, "ready")).toEqual({ action: "start", preventDefault: true });
    }
    expect(k("x", "ready")).toEqual({ action: "none", preventDefault: false });
    expect(k("Tab", "ready")).toEqual({ action: "none", preventDefault: false });
    expect(k("Escape", "ready")).toEqual({ action: "none", preventDefault: false });
  });

  it("never acts on text-field keys, chords or a focused control Space and Enter", () => {
    expect(k(" ", "ready", { textEntry: true }).action).toBe("none");
    expect(k("ArrowLeft", "playing", { textEntry: true })).toEqual({
      action: "none",
      preventDefault: false,
    });
    expect(k("r", "playing", { modifier: true }).action).toBe("none");
    expect(k("a", "ready", { modifier: true }).action).toBe("none");
    expect(k(" ", "playing", { onControl: true })).toEqual({
      action: "none",
      preventDefault: false,
    });
    expect(k("Enter", "ready", { onControl: true }).action).toBe("none");
  });

  it("routes play keys", () => {
    expect(k("ArrowLeft", "playing").action).toBe("rotate-ccw");
    expect(k("A", "playing").action).toBe("rotate-ccw");
    expect(k("ArrowRight", "playing").action).toBe("rotate-cw");
    expect(k("D", "playing").action).toBe("rotate-cw");
    expect(k("ArrowDown", "playing").action).toBe("rush");
    expect(k("S", "playing").action).toBe("rush");
    expect(k(" ", "playing").action).toBe("toggle-pause");
    expect(k("p", "paused").action).toBe("toggle-pause");
    expect(k("P", "playing").action).toBe("toggle-pause");
    expect(k("f", "playing").action).toBe("panic");
    expect(k("F", "playing").action).toBe("panic");
  });

  it("claims the keys it acts on while playing and nothing else", () => {
    expect(k("ArrowLeft", "playing").preventDefault).toBe(true);
    expect(k("f", "playing").preventDefault).toBe(true);
    expect(k("x", "playing")).toEqual({ action: "none", preventDefault: false });
  });

  it("claims arrows and Space while paused but does not rotate", () => {
    expect(k("ArrowLeft", "paused")).toEqual({ action: "none", preventDefault: true });
    expect(k("f", "paused")).toEqual({ action: "none", preventDefault: true });
  });

  it("steers, rushes and pauses during the countdown, and claims the keys", () => {
    expect(k("ArrowLeft", "countdown")).toEqual({ action: "rotate-ccw", preventDefault: true });
    expect(k("d", "countdown")).toEqual({ action: "rotate-cw", preventDefault: true });
    expect(k("ArrowDown", "countdown")).toEqual({ action: "rush", preventDefault: true });
    expect(k(" ", "countdown")).toEqual({ action: "toggle-pause", preventDefault: true });
    expect(k("Enter", "countdown")).toEqual({ action: "none", preventDefault: false });
  });

  it("ignores everything on game over", () => {
    expect(k(" ", "over")).toEqual({ action: "none", preventDefault: false });
    expect(k("ArrowLeft", "over")).toEqual({ action: "none", preventDefault: false });
  });

  it("starts on uppercase A, S and D", () => {
    for (const key of ["A", "S", "D"]) {
      expect(k(key, "ready")).toEqual({ action: "start", preventDefault: true });
    }
  });

  it("does not start or toggle pause on auto-repeat, but still claims the key", () => {
    expect(k(" ", "ready", { repeat: true })).toEqual({ action: "none", preventDefault: true });
    expect(k(" ", "playing", { repeat: true })).toEqual({ action: "none", preventDefault: true });
    expect(k("p", "paused", { repeat: true })).toEqual({ action: "none", preventDefault: true });
  });

  it("keeps rotating on auto-repeat", () => {
    expect(k("ArrowLeft", "playing", { repeat: true }).action).toBe("rotate-ccw");
    expect(k("d", "playing", { repeat: true }).action).toBe("rotate-cw");
  });
});
