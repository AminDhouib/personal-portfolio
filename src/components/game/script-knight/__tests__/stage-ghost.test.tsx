import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Runner } from "../run-floor";
import type { RunOutcome } from "../sandbox/run-client";
import { Stage } from "../stage";

const DAY = "2026-10-15";
const LOG = "1:h0h0h0h0h0w0w0w0s0h0h0h0h0w0w0w0w0";
const TOKENS = LOG.slice(2).match(/../g) ?? [];
const STATS_KEY = "knight:stats";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${DAY}T12:00:00Z`));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ entries: [], you: null }), { status: 200 })),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const finished = (log: string): RunOutcome => ({ kind: "finished", log, thoughts: [] });

const runner: Runner = (_req, onTurn) => {
  TOKENS.forEach((token, i) => onTurn(i + 1, token, []));
  return { done: Promise.resolve(finished(LOG)), cancel: () => {} };
};

function store(ghost: unknown) {
  localStorage.setItem(STATS_KEY, JSON.stringify({ v: 1, ghost }));
}

function openToday() {
  render(<Stage runner={runner} />);
  fireEvent.click(screen.getByRole("button", { name: "Today's floor" }));
}

async function runAndSkip() {
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  const skip = await screen.findByRole("button", { name: "Skip to end" });
  await waitFor(() => expect((skip as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(skip);
}

const ghostCount = () => document.querySelectorAll("[data-ghost]").length;

describe("Stage, the ghost", () => {
  it("shows no ghost before the day has a clear", () => {
    openToday();
    expect(ghostCount()).toBe(0);
  });

  it("keeps the log of a daily clear as the day's ghost", async () => {
    openToday();
    await runAndSkip();
    await screen.findByText("Floor passed");
    const saved = JSON.parse(localStorage.getItem(STATS_KEY) ?? "{}");
    expect(saved.ghost).toEqual({ day: DAY, log: LOG, score: 118 });
  });

  it("draws the stored ghost on Today's floor, and not on a tower floor", () => {
    store({ day: DAY, log: LOG, score: 118 });
    render(<Stage runner={runner} />);
    expect(ghostCount()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Today's floor" }));
    expect(ghostCount()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Towers" }));
    expect(ghostCount()).toBe(0);
  });

  it("draws no ghost that belongs to another day", () => {
    store({ day: "2026-10-14", log: LOG, score: 118 });
    openToday();
    expect(ghostCount()).toBe(0);
  });

  it("draws no ghost whose log does not play on the day's floor", () => {
    store({ day: DAY, log: `${LOG}w0w0`, score: 5 });
    openToday();
    expect(ghostCount()).toBe(0);
  });

  it("does not change the run: same result, and the ghost is not posted or scored", async () => {
    store({ day: DAY, log: LOG, score: 300 });
    openToday();
    await runAndSkip();
    expect(await screen.findByText("Floor passed")).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem(STATS_KEY) ?? "{}");
    expect(saved.bestDaily).toMatchObject({ day: DAY, score: 118 });
    // A lower score than the ghost's does not replace it.
    expect(saved.ghost).toEqual({ day: DAY, log: LOG, score: 300 });
    const fetched = vi.mocked(fetch).mock.calls.map(([, init]) => init?.method ?? "GET");
    expect(fetched).not.toContain("POST");
  });
});
