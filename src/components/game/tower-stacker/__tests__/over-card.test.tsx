import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dailyTowerSeed, freeSeed } from "../daily";
import { craneOffset, drop, newRun, runSeconds, type TowerRun } from "../engine";
import { Stage } from "../stage";

const realGetContext =
  Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext") ?? {};
let clock = 0;
const fetchMock = vi.fn();

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

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
  clock = 1000;
  window.localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(json({ entries: [], you: null }));
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  vi.spyOn(performance, "now").mockImplementation(() => clock);
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
  window.localStorage.clear();
});

const stage = () => screen.getByTestId("tower-stage");
const hit = () => screen.getByTestId("tower-hit-layer");
const gets = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method !== "POST");

function timeAtOffset(run: TowerRun, from: number, target: number): number {
  const swing = run.swing;
  if (!swing) throw new Error("run is over");
  for (let t = Math.max(from, swing.spawnAt); t < from + 20_000; t++) {
    if (Math.round(craneOffset(swing, t)) === target) return t;
  }
  throw new Error("no instant");
}

/** Trim once at offset 205, then miss at 205: a two-drop run ending on one floor. */
function playToMiss(seed: number): TowerRun {
  let mirror = newRun(seed, clock);
  let t = timeAtOffset(mirror, clock, 205);
  const first = drop(mirror, t);
  if (!first) throw new Error("mirror drop refused");
  mirror = first.run;
  clock = t;
  fireEvent.pointerDown(hit());
  t = timeAtOffset(mirror, t, 205);
  clock = t;
  fireEvent.pointerDown(hit());
  const last = drop(mirror, t);
  if (!last) throw new Error("mirror drop refused");
  return last.run;
}

const startRun = () => fireEvent.click(screen.getByRole("button", { name: "Start" }));

describe("a daily tower run", () => {
  it("reads the board only when the card opens, and records the run locally", async () => {
    render(<Stage />);
    startRun();
    expect(fetchMock).not.toHaveBeenCalled();
    playToMiss(dailyTowerSeed("2026-10-15"));
    expect(stage().dataset.phase).toBe("over");
    await waitFor(() => expect(gets()).toHaveLength(1));
    expect((gets()[0] as [string])[0]).toBe("/api/arcade/scores?game=tower-stacker&board=daily");
    expect(screen.getByRole("heading", { name: /^Tower board$/ })).toBeTruthy();
    expect(screen.getByLabelText("Name for the board")).toBeTruthy();

    const stored = JSON.parse(window.localStorage.getItem("tower:stats") ?? "null");
    expect(stored).toMatchObject({
      runs: 1,
      bestDaily: { day: "2026-10-15", score: 10 },
      lastDailyDay: "2026-10-15",
      streakDays: 1,
      bestFree: 0,
    });
  });

  it("posts the run's numbers (floors, perfects, streak, seconds) and today's day", async () => {
    render(<Stage />);
    startRun();
    const finished = playToMiss(dailyTowerSeed("2026-10-15"));
    await waitFor(() => expect(gets()).toHaveLength(1));
    fetchMock.mockResolvedValueOnce(
      json({
        ok: true,
        boards: [{ period: "daily", board: "daily:2026-10-15", rank: 1, best: 10, improved: true }],
      }),
    );
    fireEvent.change(screen.getByLabelText("Name for the board"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.getByText("#1 today")).toBeTruthy());
    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    ) as [string, RequestInit];
    const body = JSON.parse(post[1].body as string);
    expect(body.score).toBe(10);
    expect(body.detail).toEqual({
      day: 20261015,
      blocks: 1,
      perfects: 0,
      streak: 0,
      seconds: runSeconds(finished, clock),
    });
    expect(JSON.parse(window.localStorage.getItem("tower:stats") ?? "{}").handle).toBe("Ada");
  });

  it("closes the card to submits when 00:00 UTC passes during the run", async () => {
    vi.setSystemTime(new Date("2026-10-15T23:59:59Z"));
    render(<Stage />);
    startRun();
    vi.setSystemTime(new Date("2026-10-16T00:00:01Z"));
    playToMiss(dailyTowerSeed("2026-10-15"));
    expect(stage().dataset.phase).toBe("over");
    expect(screen.getByText("Today's tower closed at 00:00 UTC. Play the new one.")).toBeTruthy();
    expect(screen.queryByLabelText("Name for the board")).toBeNull();
    // The run still counts as the day it began on.
    const stored = JSON.parse(window.localStorage.getItem("tower:stats") ?? "null");
    expect(stored.bestDaily.day).toBe("2026-10-15");
    // The new tower is one tap away and seeds from the new UTC day.
    fireEvent.click(screen.getByRole("button", { name: "Play the new tower" }));
    expect(stage().dataset.phase).toBe("live");
    expect(stage().dataset.mode).toBe("daily");
    await act(async () => {
      await Promise.resolve();
    });
  });
});

describe("a free build run", () => {
  it("has no form and no board read, keeps a local best, and links to the daily tower", async () => {
    render(<Stage seedText="e2e" />);
    startRun();
    playToMiss(freeSeed("e2e"));
    expect(stage().dataset.phase).toBe("over");
    expect(screen.queryByLabelText("Name for the board")).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    const card = screen.getByTestId("tower-over-card");
    expect(card.textContent).toContain("Best on this device");
    const stored = JSON.parse(window.localStorage.getItem("tower:stats") ?? "null");
    expect(stored).toMatchObject({ runs: 1, bestFree: 10, bestDaily: null, streakDays: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Play today's tower" }));
    expect(stage().dataset.phase).toBe("live");
    expect(stage().dataset.mode).toBe("daily");
    await act(async () => {
      await Promise.resolve();
    });
  });
});
