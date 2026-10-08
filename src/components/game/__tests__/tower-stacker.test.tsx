import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TowerStacker from "../tower-stacker";
import { freeSeed } from "../tower-stacker/daily";
import * as engine from "../tower-stacker/engine";

vi.mock("../tower-stacker/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../tower-stacker/engine")>();
  return { ...actual, newRun: vi.fn(actual.newRun) };
});

const realGetContext =
  Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext") ?? {};

beforeEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    value: () => null,
    configurable: true,
    writable: true,
  });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  cleanup();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", realGetContext);
  vi.unstubAllGlobals();
  vi.mocked(engine.newRun).mockClear();
});

describe("TowerStacker wrapper", () => {
  it("renders the first-party stage and no iframe", () => {
    const { container } = render(<TowerStacker />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByTestId("tower-stage")).toBeTruthy();
  });

  it("an initialSeed of abc starts the run on freeSeed(abc)", () => {
    render(<TowerStacker initialSeed="abc" />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    const calls = vi.mocked(engine.newRun).mock.calls;
    expect(calls[calls.length - 1]?.[0]).toBe(freeSeed("abc"));
  });
});
