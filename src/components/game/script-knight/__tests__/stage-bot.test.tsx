import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROGRESS_KEY } from "../progress";
import type { Runner } from "../run-floor";
import type { RunOutcome } from "../sandbox/run-client";
import { Stage } from "../stage";

const DAY = "2026-10-15";
const LOG = "1:h0h0h0h0h0w0w0w0s0h0h0h0h0w0w0w0w0";
const TOKENS = LOG.slice(2).match(/../g) ?? [];

let calls: number;

beforeEach(() => {
  localStorage.clear();
  calls = 0;
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
  calls += 1;
  TOKENS.forEach((token, i) => onTurn(i + 1, token, []));
  return { done: Promise.resolve(finished(LOG)), cancel: () => {} };
};

const watch = () => fireEvent.click(screen.getByRole("button", { name: "Watch the bot" }));
const posts = () => vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");

async function skipToEnd() {
  const skip = await screen.findByRole("button", { name: "Skip to end" });
  await waitFor(() => expect((skip as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(skip);
}

describe("Stage, Watch the bot", () => {
  it("plays the reference bot on a tower floor without running, scoring or saving", async () => {
    render(<Stage runner={runner} />);
    watch();
    expect(screen.getByRole("status").textContent).toMatch(/not scored, saved or posted/);
    await skipToEnd();
    expect(screen.getByRole("log").textContent).toContain("Turn 1:");
    expect(screen.queryByText("Floor passed")).toBeNull();
    expect(calls).toBe(0);
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
    expect(posts()).toHaveLength(0);
  });

  it("plays the bot on Today's floor with no ghost, board, streak or post", async () => {
    render(<Stage runner={runner} />);
    fireEvent.click(screen.getByRole("button", { name: "Today's floor" }));
    watch();
    await skipToEnd();
    expect(screen.queryByText("Floor passed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(localStorage.getItem("knight:stats")).toBeNull();
    expect(posts()).toHaveLength(0);
  });

  it("stops watching on request, and when the player runs their own code", async () => {
    render(<Stage runner={runner} />);
    watch();
    fireEvent.click(screen.getByRole("button", { name: "Stop watching" }));
    expect(screen.queryByRole("status")).toBeNull();

    watch();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(calls).toBe(1));
    expect(screen.queryByText(/Watching the reference bot/)).toBeNull();
  });

  it("is gone once the player moves to another floor", () => {
    render(<Stage runner={runner} />);
    watch();
    fireEvent.click(screen.getByRole("button", { name: "Today's floor" }));
    expect(screen.queryByText(/Watching the reference bot/)).toBeNull();
  });
});
