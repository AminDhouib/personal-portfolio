import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// The poster is the lazy boundary: the game module (and with it the sim, the
// scene and three.js) is imported on Play, or on idle on a desktop that has
// not asked to save data, and never at render.

const loads = { count: 0 };

function stubPointer(fine: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: query === "(pointer: fine)" ? fine : false })),
  );
}

let idle: (() => void)[] = [];

beforeEach(() => {
  // A fresh module registry and a fresh mock each test, so the counter sees every import.
  vi.resetModules();
  loads.count = 0;
  vi.doMock("../../failover", () => {
    loads.count++;
    return { FailoverGame: () => <div data-testid="failover-game">game</div> };
  });
  idle = [];
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => idle.push(cb));
  vi.stubGlobal("cancelIdleCallback", () => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderPoster() {
  const { FailoverPoster } = await import("../poster");
  render(<FailoverPoster />);
}

describe("FailoverPoster", () => {
  it("shows the title, the Play button and the sound note without loading the game", async () => {
    stubPointer(false);
    await renderPoster();
    expect(screen.getByRole("button", { name: /play failover/i })).toBeInTheDocument();
    expect(screen.getByText(/sound is off/i)).toBeInTheDocument();
    expect(loads.count).toBe(0);
  });

  it("loads and mounts the game on Play", async () => {
    stubPointer(false);
    await renderPoster();
    expect(loads.count).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /play failover/i }));
    expect(await screen.findByTestId("failover-game")).toBeInTheDocument();
    expect(loads.count).toBe(1);
  });

  it("warms the game chunk when the browser is idle on a desktop", async () => {
    stubPointer(true);
    await renderPoster();
    expect(loads.count).toBe(0);
    expect(idle).toHaveLength(1);
    await act(async () => {
      idle[0]!();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(loads.count).toBe(1));
    // Warming does not start the game.
    expect(screen.queryByTestId("failover-game")).toBeNull();
  });

  it("does not warm it on a phone, or when the visitor saves data", async () => {
    stubPointer(false);
    await renderPoster();
    expect(idle).toHaveLength(0);
    cleanup();

    stubPointer(true);
    vi.stubGlobal("navigator", { ...navigator, connection: { saveData: true } });
    await renderPoster();
    expect(idle).toHaveLength(0);
    expect(loads.count).toBe(0);
  });
});
