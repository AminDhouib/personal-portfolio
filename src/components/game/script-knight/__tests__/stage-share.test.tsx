import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Runner } from "../run-floor";
import type { RunOutcome } from "../sandbox/run-client";
import { Stage } from "../stage";

const DAY = "2026-10-15";
const LOG = "1:h0h0h0h0h0w0w0w0s0h0h0h0h0w0w0w0w0";
const TOKENS = LOG.slice(2).match(/../g) ?? [];

let copied: string[];

beforeEach(() => {
  localStorage.clear();
  copied = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${DAY}T12:00:00Z`));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ entries: [], you: null }), { status: 200 })),
  );
  Object.defineProperty(navigator, "clipboard", {
    value: {
      writeText: async (text: string) => {
        copied.push(text);
      },
    },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "clipboard");
});

const finished = (log: string): RunOutcome => ({ kind: "finished", log, thoughts: [] });

function runner(tokens: string[], outcome: RunOutcome): Runner {
  return (_req, onTurn) => {
    tokens.forEach((token, i) => onTurn(i + 1, token, []));
    return { done: Promise.resolve(outcome), cancel: () => {} };
  };
}

async function runAndSkip() {
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  const skip = await screen.findByRole("button", { name: "Skip to end" });
  await waitFor(() => expect((skip as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(skip);
}

describe("Stage, sharing a run", () => {
  it("shares a passed daily with its par and a replay link that opens that run", async () => {
    render(<Stage runner={runner(TOKENS, finished(LOG))} />);
    fireEvent.click(screen.getByRole("button", { name: "Today's floor" }));
    await runAndSkip();
    fireEvent.click(await screen.findByRole("button", { name: "Share this run" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toMatch(
      /^Script Knight, 2026-10-15: 118 points in 17 turns \(par 118\) https:\/\/\S+\/games\/script-knight#replay=1\.d\.20261015\.h0h0h0h0h0w0w0w0s0h0h0h0h0w0w0w0w0$/,
    );
  });

  it("shares a passed tower floor by its name, with no par", async () => {
    const walks = Array.from({ length: 7 }, () => "w-");
    render(<Stage runner={runner(walks, finished(`1:${walks.join("")}`))} />);
    await runAndSkip();
    fireEvent.click(await screen.findByRole("button", { name: "Share this run" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toMatch(
      /^Script Knight, The Narrow Path, floor 1: \d+ points in 7 turns https:\/\/\S+#replay=1\.t\.np\.1\.0\.w-w-w-w-w-w-w-$/,
    );
  });

  it("offers no share for a floor that was not passed", async () => {
    const outcome: RunOutcome = { kind: "timeout", log: "1:w-w-", phase: "turn", t: 3 };
    render(<Stage runner={runner(["w-", "w-"], outcome)} />);
    await runAndSkip();
    await screen.findByText(/ran longer than/);
    expect(screen.queryByRole("button", { name: "Share this run" })).toBeNull();
  });
});
