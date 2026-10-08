import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Stage } from "../stage";

const realGetContext =
  Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext") ?? {};

function stubPointer(coarse: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: coarse && query.includes("pointer: coarse"),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    value: () => null,
    configurable: true,
    writable: true,
  });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  document.documentElement.style.overflow = "";
});

afterEach(() => {
  cleanup();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", realGetContext);
  vi.unstubAllGlobals();
  document.documentElement.style.overflow = "";
});

const sheet = () => screen.getByTestId("tower-sheet");

describe("phone play sheet", () => {
  it("a coarse pointer enters a fixed full-screen sheet on Start and locks page scroll", () => {
    stubPointer(true);
    render(<Stage seedText="e2e" />);
    expect(sheet().className).not.toContain("fixed");
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(sheet().className).toContain("fixed inset-0 z-80");
    expect(sheet().className).toContain("h-[100dvh]");
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("Exit leaves the sheet, restores scroll and returns focus to Start", () => {
    stubPointer(true);
    render(<Stage seedText="e2e" />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    const exit = screen.getByRole("button", { name: "Exit" });
    expect(exit.className).toContain("min-h-11");
    expect(exit.className).toContain("min-w-11");
    fireEvent.click(exit);
    expect(sheet().className).not.toContain("fixed");
    expect(document.documentElement.style.overflow).toBe("");
    expect(screen.getByTestId("tower-stage").dataset.phase).toBe("ready");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Start" }));
  });

  it("restores page scroll when unmounted mid-run", () => {
    stubPointer(true);
    const view = render(<Stage seedText="e2e" />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(document.documentElement.style.overflow).toBe("hidden");
    view.unmount();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("a fine pointer never enters the sheet", () => {
    stubPointer(false);
    render(<Stage seedText="e2e" />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(sheet().className).not.toContain("fixed");
    expect(document.documentElement.style.overflow).toBe("");
    expect(screen.queryByRole("button", { name: "Exit" })).toBeNull();
  });
});
