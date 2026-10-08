// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { keyboardStep, orbitalKeyDecision, shouldCaptureTouch } from "../input";
import type { GameStatus } from "../types";

const STATUSES: GameStatus[] = ["armed", "playing", "paused", "dying", "dead"];

describe("shouldCaptureTouch", () => {
  it("never captures a button target, in any status", () => {
    const button = document.createElement("button");
    for (const s of STATUSES) expect(shouldCaptureTouch(button, s)).toBe(false);
  });

  it("never captures a span inside a button", () => {
    const button = document.createElement("button");
    const span = document.createElement("span");
    button.appendChild(span);
    for (const s of STATUSES) expect(shouldCaptureTouch(span, s)).toBe(false);
  });

  it("never captures links, inputs or opted-in elements", () => {
    const a = document.createElement("a");
    const input = document.createElement("input");
    const optIn = document.createElement("div");
    optIn.setAttribute("data-allow-touch", "");
    for (const el of [a, input, optIn]) expect(shouldCaptureTouch(el, "playing")).toBe(false);
  });

  it("does not throw and returns false for non-Element targets", () => {
    for (const s of STATUSES) {
      expect(shouldCaptureTouch(window, s)).toBe(false);
      expect(shouldCaptureTouch(null, s)).toBe(false);
    }
  });

  it("captures a plain div only while playing", () => {
    const div = document.createElement("div");
    expect(shouldCaptureTouch(div, "playing")).toBe(true);
    for (const s of STATUSES.filter((x) => x !== "playing")) {
      expect(shouldCaptureTouch(div, s)).toBe(false);
    }
  });

  it("keeps steering a drag that began on a control, but only while playing", () => {
    const button = document.createElement("button");
    expect(shouldCaptureTouch(button, "playing", "move")).toBe(true);
    for (const s of STATUSES.filter((x) => x !== "playing")) {
      expect(shouldCaptureTouch(button, s, "move")).toBe(false);
    }
  });
});

describe("keyboardStep", () => {
  it("matches the 60 Hz feel", () => {
    expect(keyboardStep(1 / 60)).toBeCloseTo(0.14, 5);
  });

  it("scales down on a 144 Hz display", () => {
    expect(keyboardStep(1 / 144)).toBeCloseTo(0.0583, 3);
  });

  it("never steps backwards on a negative frame delta", () => {
    expect(keyboardStep(-0.01)).toBe(0);
  });

  it("caps a hitch at the 0.05 s step", () => {
    expect(keyboardStep(1)).toBeCloseTo(keyboardStep(0.05), 10);
    expect(keyboardStep(1)).toBeCloseTo(0.42, 5);
  });
});

describe("orbitalKeyDecision", () => {
  const base = { textEntry: false, onControl: false, runLive: true, inView: true };

  it("leaves keys typed into a text field alone", () => {
    expect(orbitalKeyDecision({ ...base, key: "a", textEntry: true })).toEqual({
      ignore: true,
      preventDefault: false,
    });
  });

  it.each(["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d", " "])(
    "claims %j while a run is live and in view",
    (key) => expect(orbitalKeyDecision({ ...base, key }).preventDefault).toBe(true),
  );

  it("lets Space activate a focused control but still claims steering keys", () => {
    expect(orbitalKeyDecision({ ...base, key: " ", onControl: true }).preventDefault).toBe(false);
    expect(orbitalKeyDecision({ ...base, key: "arrowleft", onControl: true }).preventDefault).toBe(
      true,
    );
  });

  it("claims nothing when the run is not live or not in view", () => {
    expect(orbitalKeyDecision({ ...base, key: " ", runLive: false }).preventDefault).toBe(false);
    expect(orbitalKeyDecision({ ...base, key: "arrowdown", inView: false }).preventDefault).toBe(
      false,
    );
  });

  it("does not claim unrelated keys", () => {
    expect(orbitalKeyDecision({ ...base, key: "x" })).toEqual({
      ignore: false,
      preventDefault: false,
    });
  });
});
