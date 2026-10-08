import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dailyTowerSeed } from "../daily";
import { newRun } from "../engine";
import { Stage } from "../stage";

// Spy on newRun without changing it: the seed a run starts from is the whole contract.
vi.mock("../engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine")>();
  return { ...actual, newRun: vi.fn(actual.newRun) };
});

const realGetContext =
  Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext") ?? {};

function fakeCanvasContext() {
  return new Proxy(
    {},
    {
      get: (_target, prop) => (prop === "measureText" ? () => ({ width: 10 }) : () => undefined),
      set: () => true,
    },
  );
}

beforeEach(() => {
  vi.mocked(newRun).mockClear();
  vi.spyOn(performance, "now").mockImplementation(() => 1000);
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    value: () => fakeCanvasContext(),
    configurable: true,
    writable: true,
  });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  cleanup();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", realGetContext);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const daily = () => screen.getByRole("button", { name: /Today's tower/ });
const free = () => screen.getByRole("button", { name: /Free build/ });
const start = () => fireEvent.click(screen.getByRole("button", { name: "Start" }));
const lastSeed = () => vi.mocked(newRun).mock.calls.at(-1)?.[0];

describe("the mode row", () => {
  it("offers Today's tower (selected) and Free build, each at least 44 px", () => {
    render(<Stage />);
    expect(daily().getAttribute("aria-pressed")).toBe("true");
    expect(free().getAttribute("aria-pressed")).toBe("false");
    for (const button of [daily(), free()]) {
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("min-w-11");
    }
  });

  it("shows the UTC date and the reset countdown on Today's tower", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T23:30:00Z"));
    render(<Stage />);
    expect(daily().textContent).toContain("2026-10-15 UTC");
    expect(daily().textContent).toContain("Resets in 30m");
  });

  it("preselects Free build when a ?tower-seed= text is given", () => {
    render(<Stage seedText="e2e" />);
    expect(free().getAttribute("aria-pressed")).toBe("true");
    expect(daily().getAttribute("aria-pressed")).toBe("false");
  });

  it("captions Free build by where its tower comes from", () => {
    const { unmount } = render(<Stage />);
    expect(free().textContent).toContain("Random, unranked");
    unmount();
    render(<Stage seedText="e2e" />);
    expect(free().textContent).toContain("Fixed seed, unranked");
    expect(free().textContent).not.toContain("Random");
  });

  it("reserves two lines for each caption so the countdown cannot nudge the row", () => {
    render(<Stage />);
    for (const button of [daily(), free()]) {
      const caption = button.querySelectorAll("span")[1];
      expect(caption?.className).toContain("min-h-[2.5em]");
    }
  });

  it("switches mode on a click", () => {
    render(<Stage />);
    fireEvent.click(free());
    expect(free().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(daily());
    expect(daily().getAttribute("aria-pressed")).toBe("true");
  });
});

describe("what a run is seeded from", () => {
  it("Today's tower seeds from the UTC day, not the local one", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T23:30:00Z"));
    render(<Stage />);
    start();
    expect(lastSeed()).toBe(646_338_190);
    expect(lastSeed()).toBe(dailyTowerSeed("2026-10-15"));
    expect(screen.getByTestId("tower-stage").dataset.mode).toBe("daily");
  });

  it("takes the day at Start, so a later start reads the new day", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T23:59:59Z"));
    render(<Stage />);
    vi.setSystemTime(new Date("2026-10-16T00:00:01Z"));
    start();
    expect(lastSeed()).toBe(dailyTowerSeed("2026-10-16"));
  });

  it("Free build with no param uses a random seed", () => {
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint32Array) => {
      array[0] = 12_345;
      return array;
    }) as unknown as typeof crypto.getRandomValues);
    render(<Stage />);
    fireEvent.click(free());
    start();
    expect(spy).toHaveBeenCalled();
    expect(lastSeed()).toBe(12_345);
    expect(screen.getByTestId("tower-stage").dataset.mode).toBe("free");
  });
});
