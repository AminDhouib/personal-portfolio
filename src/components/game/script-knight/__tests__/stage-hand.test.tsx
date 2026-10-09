import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyScriptKnight } from "@/lib/arcade/games";
import { MODE_KEY } from "../mode";
import { PROGRESS_KEY } from "../progress";
import type { Runner } from "../run-floor";
import { Stage } from "../stage";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(window, "matchMedia");
  Reflect.deleteProperty(window, "visualViewport");
});

/** A runner that must never be used: hand mode starts no sandbox. */
const noSandbox: Runner = () => {
  throw new Error("hand mode must not start the sandbox");
};

function stubPointer(coarse: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("coarse") ? coarse : query.includes("fine") ? !coarse : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function fakeViewport(height: number) {
  const vv = Object.assign(new EventTarget(), { height, offsetTop: 0, width: 390, scale: 1 });
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  return vv;
}

const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const walkForward = (times: number) => {
  for (let i = 0; i < times; i += 1) click("Walk forward");
};

describe("Stage, play style", () => {
  it("writes code by default on a desktop pointer and plays by hand on a coarse one", () => {
    stubPointer(false);
    const desktop = render(<Stage runner={noSandbox} />);
    expect(screen.getByRole("button", { name: "Write code" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByLabelText("Your Player code (JavaScript)")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Play by hand" })).toBeNull();
    desktop.unmount();

    stubPointer(true);
    render(<Stage runner={noSandbox} />);
    expect(screen.getByRole("button", { name: "Play by hand" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("region", { name: "Play by hand" })).toBeTruthy();
    expect(screen.queryByLabelText("Your Player code (JavaScript)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });

  it("is one toggle away on desktop, and remembers the choice", () => {
    stubPointer(false);
    const first = render(<Stage runner={noSandbox} />);
    click("Play by hand");
    expect(screen.getByRole("region", { name: "Play by hand" })).toBeTruthy();
    expect(screen.queryByLabelText("Your Player code (JavaScript)")).toBeNull();
    expect(localStorage.getItem(MODE_KEY)).toBe('{"v":1,"mode":"hand"}');
    first.unmount();

    render(<Stage runner={noSandbox} />);
    expect(screen.getByRole("region", { name: "Play by hand" })).toBeTruthy();
    click("Write code");
    expect(localStorage.getItem(MODE_KEY)).toBe('{"v":1,"mode":"code"}');
    expect(screen.getByLabelText("Your Player code (JavaScript)")).toBeTruthy();
  });

  it("leaves the epic toggle out of hand mode", () => {
    stubPointer(true);
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        v: 1,
        at: { tower: "narrow-path", level: 1, epic: false },
        towers: {
          "narrow-path": {
            reached: 9,
            best: Object.fromEntries(
              Array.from({ length: 9 }, (_unused, i) => [
                String(i + 1),
                { score: 1, grade: 1, turns: 9 },
              ]),
            ),
          },
          "powder-keep": { reached: 1, best: {} },
        },
      }),
    );
    render(<Stage runner={noSandbox} />);
    expect(screen.queryByLabelText("Epic mode")).toBeNull();
    click("Write code");
    expect(screen.getByLabelText("Epic mode")).toBeTruthy();
  });
});

describe("Stage, playing a floor by hand", () => {
  beforeEach(() => stubPointer(true));

  it("clears Narrow Path 1 with taps, with no sandbox, and records the clear", () => {
    render(<Stage runner={noSandbox} />);
    walkForward(6);
    expect(screen.queryByText("Floor passed")).toBeNull();
    walkForward(1);
    expect(screen.getByText("Floor passed")).toBeTruthy();
    const progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}");
    expect(progress.towers["narrow-path"].best["1"].turns).toBe(7);
  });

  it("takes back the last turn with Undo, and the pad stops accepting turns after the pass", () => {
    render(<Stage runner={noSandbox} />);
    walkForward(6);
    click("Undo");
    walkForward(1);
    expect(screen.queryByText("Floor passed")).toBeNull();
    walkForward(1);
    expect(screen.getByText("Floor passed")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Walk forward" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("starts over from the pad, and from Retry on the result card", () => {
    render(<Stage runner={noSandbox} />);
    walkForward(7);
    expect(screen.getByText("Floor passed")).toBeTruthy();
    click("Start over");
    expect(screen.queryByText("Floor passed")).toBeNull();
    walkForward(7);
    expect(screen.getByText("Floor passed")).toBeTruthy();
  });

  it("plays with the keyboard too", () => {
    render(<Stage runner={noSandbox} />);
    for (let i = 0; i < 7; i += 1) fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Floor passed")).toBeTruthy();
  });

  it("starts the next floor on a fresh run", () => {
    render(<Stage runner={noSandbox} />);
    walkForward(7);
    click("Next floor");
    expect(screen.queryByText("Floor passed")).toBeNull();
    expect(screen.getByText(/floor 2/i)).toBeTruthy();
  });

  it("drops a result when the player switches to code", () => {
    render(<Stage runner={noSandbox} />);
    walkForward(7);
    click("Write code");
    expect(screen.queryByText("Floor passed")).toBeNull();
  });
});

describe("Stage, Today's floor by hand", () => {
  const DAY = "2026-10-15";
  /** The daily floor's clear (the same log the code-run tests use): 17 turns for 118 points. */
  const MOVES: [string, number][] = [
    ["Shoot", 5],
    ["Walk", 3],
    ["Rescue", 1],
    ["Shoot", 4],
    ["Walk", 4],
  ];
  const LOG = "1:h0h0h0h0h0w0w0w0s0h0h0h0h0w0w0w0w0";
  let posts: { url: string; body: Record<string, unknown> }[];

  beforeEach(() => {
    stubPointer(true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${DAY}T12:00:00Z`));
    posts = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          posts.push({ url, body: JSON.parse(String(init.body)) });
          return new Response(
            JSON.stringify({
              ok: true,
              boards: [{ period: "daily", board: DAY, rank: 1, best: 118, improved: true }],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ entries: [], you: null }), { status: 200 });
      }),
    );
  });

  function clearTodayByHand() {
    click("Today's floor");
    for (const [action, times] of MOVES) {
      click(action);
      for (let i = 0; i < times; i += 1) click(`${action} forward`);
    }
  }

  it("posts hand: 1 and a proof the server's verifier accepts", async () => {
    render(<Stage runner={noSandbox} />);
    clearTodayByHand();
    expect(screen.getByText("Floor passed")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Submit" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    const { body } = posts[0]!;
    expect(body.game).toBe("script-knight");
    expect(body.detail).toEqual({ day: 20261015, turns: 17, hand: 1 });
    expect(body.proof).toBe(LOG);
    expect(body.score).toBe(118);
    const verdict = await verifyScriptKnight({
      score: body.score as number,
      detail: body.detail as Record<string, number>,
      proof: body.proof as string,
      now: new Date(`${DAY}T12:00:00Z`),
      deadline: Date.now() + 5_000,
    });
    expect(verdict).toEqual({ ok: true });
  });

  it("updates the daily stats on a hand clear", () => {
    render(<Stage runner={noSandbox} />);
    clearTodayByHand();
    const stats = JSON.parse(localStorage.getItem("knight:stats") ?? "{}");
    expect(stats).toMatchObject({ runs: 1, bestDaily: { day: DAY, score: 118 } });
  });
});

describe("Stage, the phone play sheet", () => {
  it("opens from Play this floor as a fixed full-height sheet, locks the page, and Exit puts it back", () => {
    stubPointer(true);
    fakeViewport(844);
    const { container } = render(<Stage runner={noSandbox} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain("fixed");
    click("Play this floor");
    expect(root.className).toContain("fixed");
    expect(root.className).toContain("inset-x-0");
    expect(root.className).toContain("z-80");
    expect(root.style.height).toBe("844px");
    expect(document.documentElement.style.overflow).toBe("hidden");
    click("Exit");
    expect(root.className).not.toContain("fixed");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("shrinks with the on-screen keyboard so the Run bar stays in view while typing", () => {
    stubPointer(true);
    const vv = fakeViewport(844);
    const { container } = render(<Stage runner={noSandbox} />);
    click("Write code");
    click("Play this floor");
    const root = container.firstElementChild as HTMLElement;
    act(() => {
      vv.height = 394;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(root.style.height).toBe("394px");
    const run = screen.getByRole("button", { name: "Run" });
    expect(run.parentElement?.className).toContain("sticky");
    expect(run.parentElement?.className).toContain("bottom-0");
  });

  it("is not offered on a fine pointer", () => {
    stubPointer(false);
    render(<Stage runner={noSandbox} />);
    expect(screen.queryByRole("button", { name: "Play this floor" })).toBeNull();
  });

  it("releases the page scroll when the stage unmounts with the sheet open", () => {
    stubPointer(true);
    fakeViewport(800);
    const { unmount } = render(<Stage runner={noSandbox} />);
    click("Play this floor");
    expect(document.documentElement.style.overflow).toBe("hidden");
    unmount();
    expect(document.documentElement.style.overflow).toBe("");
  });
});
