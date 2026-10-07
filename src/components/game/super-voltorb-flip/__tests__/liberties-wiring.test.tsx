import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";

vi.mock("next/font/local", () => ({
  default: () => ({ className: "mock-font", style: { fontFamily: "mock" } }),
}));
vi.mock("../audio", () => ({
  sfx: new Proxy({}, { get: () => () => Promise.resolve() }),
  playMusic: () => {},
  stopMusic: () => {},
  fadeOutMusic: () => {},
  playGameOver: () => {},
  stopGameOver: () => {},
  playLevelWin: () => {},
  stopLevelWin: () => {},
  stopAllCues: () => {},
  setMusicMuted: () => {},
}));
vi.mock("../effects/context", () => ({
  EffectsProvider: ({ children }: { children: ReactNode }) => children,
  useEffectsTheme: () => null,
}));

import { SuperVoltorbFlipGame } from "../../super-voltorb-flip";

// A test that times out is abandoned, not stopped: its body keeps awaiting
// timers while the next tests start, and the open act scope leaves them an
// empty tree. So a finished test refuses further advances and waits out the
// one in flight before anything is torn down.
let ended = false;
let inFlight: Promise<unknown> = Promise.resolve();
beforeEach(() => {
  ended = false;
  window.localStorage.clear();
});
afterEach(async () => {
  ended = true;
  await inFlight;
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

// The phone and desktop columns both render a MemoBar (one is CSS-hidden), so
// controls appear twice in the DOM; always take the first.
const first = (name: string | RegExp) => screen.getAllByRole("button", { name })[0]!;
const tile = (row: number, col: number) =>
  screen.getAllByRole("button").find((b) => b.getAttribute("data-cell") === `${row}-${col}`)!;

describe("memo undo wiring", () => {
  it("undoes the last memo change from the button", () => {
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Memo 2"));
    fireEvent.click(tile(0, 0));
    expect(tile(0, 0).getAttribute("aria-label")).toContain("memo 2");
    fireEvent.click(first("Undo last memo"));
    expect(tile(0, 0).getAttribute("aria-label")).not.toContain("memo");
  });

  it("undoes with Ctrl+Z from a tile, but never from a text field", () => {
    render(
      <>
        <input aria-label="chat" />
        <SuperVoltorbFlipGame />
      </>,
    );
    fireEvent.click(first("Memo 3"));
    fireEvent.click(tile(1, 1));
    expect(tile(1, 1).getAttribute("aria-label")).toContain("memo 3");
    // A key typed in an unrelated field is outside .svf-root and never reaches it.
    fireEvent.keyDown(screen.getByLabelText("chat"), { key: "z", ctrlKey: true });
    expect(tile(1, 1).getAttribute("aria-label")).toContain("memo 3");
    fireEvent.keyDown(tile(1, 1), { key: "z", ctrlKey: true });
    expect(tile(1, 1).getAttribute("aria-label")).not.toContain("memo");
  });

  it("undoes a memo made by key, newest first", () => {
    render(<SuperVoltorbFlipGame />);
    const a = tile(0, 0);
    a.focus();
    fireEvent.keyDown(a, { key: "1" });
    fireEvent.keyDown(a, { key: "2" });
    expect(a.getAttribute("aria-label")).toContain("memo 1, 2");
    fireEvent.keyDown(a, { key: "z", ctrlKey: true });
    expect(a.getAttribute("aria-label")).toContain("memo 1");
    expect(a.getAttribute("aria-label")).not.toContain("memo 1, 2");
  });

  it("offers neither the button nor the key when the setting is off", () => {
    window.localStorage.setItem(
      "svf:settings",
      '{"v":1,"memoUndo":false,"stats":true,"assist":false}',
    );
    render(<SuperVoltorbFlipGame />);
    expect(screen.queryByRole("button", { name: "Undo last memo" })).toBeNull();
    fireEvent.click(first("Memo 2"));
    fireEvent.click(tile(0, 0));
    fireEvent.keyDown(tile(0, 0), { key: "z", ctrlKey: true });
    expect(tile(0, 0).getAttribute("aria-label")).toContain("memo 2");
  });
});

describe("settings and statistics entries", () => {
  it("opens Settings, flips a switch and stores it", () => {
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Settings"));
    fireEvent.click(screen.getByRole("switch", { name: /memo undo/i }));
    expect(window.localStorage.getItem("svf:settings")).toBe(
      '{"v":1,"memoUndo":false,"stats":true,"assist":false}',
    );
  });

  it("hides the Statistics entry when statistics are off", () => {
    window.localStorage.setItem(
      "svf:settings",
      '{"v":1,"memoUndo":true,"stats":false,"assist":false}',
    );
    render(<SuperVoltorbFlipGame />);
    expect(screen.queryByRole("button", { name: "Statistics" })).toBeNull();
  });

  it("never rewrites svf:progress or svf:muted because of a setting", () => {
    window.localStorage.setItem("svf:muted", "1");
    render(<SuperVoltorbFlipGame />);
    const progress = window.localStorage.getItem("svf:progress");
    fireEvent.click(first("Settings"));
    fireEvent.click(screen.getByRole("switch", { name: /statistics/i }));
    expect(window.localStorage.getItem("svf:progress")).toBe(progress);
    expect(window.localStorage.getItem("svf:muted")).toBe("1");
  });

  it("restores the saved level into the round's statistics", () => {
    window.localStorage.setItem(
      "svf:progress",
      JSON.stringify({ currentLevel: 3, totalScore: 40 }),
    );
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Quit"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Quit" }));
    const stats = JSON.parse(window.localStorage.getItem("svf:stats") ?? "{}");
    expect(stats.highestLevel).toBe(3);
  });
});

describe("statistics recording", () => {
  it("records a quit round", () => {
    vi.useFakeTimers();
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Quit"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Quit" }));
    const stats = JSON.parse(window.localStorage.getItem("svf:stats") ?? "{}");
    expect(stats.rounds).toEqual({ played: 1, won: 0, lost: 0, quit: 1 });
  });

  it("records nothing while statistics are off", () => {
    window.localStorage.setItem(
      "svf:settings",
      '{"v":1,"memoUndo":true,"stats":false,"assist":false}',
    );
    vi.useFakeTimers();
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Quit"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Quit" }));
    expect(window.localStorage.getItem("svf:stats")).toBeNull();
  });
});

const quitRound = () => {
  fireEvent.click(first("Quit"));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Quit" }));
};
const advance = (ms: number) => {
  if (ended) return Promise.reject(new Error("the test already ended"));
  const step = act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  inFlight = new Promise((done) => void step.then(done, done));
  return step;
};
const savedStats = () => JSON.parse(window.localStorage.getItem("svf:stats") ?? "{}");
const memoLabelled = () =>
  screen
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("data-cell") && /memo/.test(b.getAttribute("aria-label") ?? ""));

describe("one record per round", () => {
  it("does not record a finished round again when the board re-renders", () => {
    vi.useFakeTimers();
    render(<SuperVoltorbFlipGame />);
    quitRound();
    expect(savedStats().rounds.played).toBe(1);
    // Turning statistics off and on again changes the recorder under the effect.
    fireEvent.click(first("Settings"));
    fireEvent.click(screen.getByRole("switch", { name: /statistics/i }));
    fireEvent.click(screen.getByRole("switch", { name: /statistics/i }));
    expect(savedStats().rounds.played).toBe(1);
  });

  it("does not pop the Statistics panel open when it is switched back on", () => {
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Statistics"));
    expect(screen.getByRole("dialog", { name: "Statistics" })).toBeInTheDocument();
    // Settings and Statistics are separate modals: reach the switch via Settings.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(first("Settings"));
    fireEvent.click(screen.getByRole("switch", { name: /statistics/i }));
    fireEvent.click(screen.getByRole("switch", { name: /statistics/i }));
    expect(screen.queryByRole("dialog", { name: "Statistics" })).toBeNull();
  });
});

describe("undo is gated", () => {
  it("does nothing after memo, quit and the next round", async () => {
    vi.useFakeTimers();
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Memo 2"));
    fireEvent.click(tile(0, 0));
    expect(memoLabelled()).toHaveLength(1);
    quitRound();
    expect(first("Undo last memo")).toBeDisabled();
    await advance(1500); // the reveal, then the result banner
    fireEvent.click(screen.getByRole("button", { name: /Next round|Continue/ }));
    await advance(3000);
    expect(memoLabelled()).toHaveLength(0);
    expect(first("Undo last memo")).toBeDisabled();
    fireEvent.keyDown(tile(0, 0), { key: "z", ctrlKey: true });
    expect(memoLabelled()).toHaveLength(0);
  });

  it("shows none of the old round's memos while the board flips down", async () => {
    vi.useFakeTimers();
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Memo 2"));
    fireEvent.click(tile(0, 0));
    fireEvent.click(tile(0, 1));
    expect(memoLabelled()).toHaveLength(2);
    quitRound();
    await advance(1500); // the reveal, then the result banner
    fireEvent.click(screen.getByRole("button", { name: /Next round|Continue/ }));
    // From the first frame of the flip-down until the next board is dealt.
    for (const ms of [150, 800, 1500]) {
      await advance(ms);
      expect(memoLabelled()).toHaveLength(0);
    }
    // Renders the whole board across several timer steps: about 2.5 s under
    // coverage locally, so the 5 s default has no margin on a slower runner.
  }, 20000);

  it("ignores Ctrl+Z typed in a text field inside the game", () => {
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Memo 3"));
    fireEvent.click(tile(1, 1));
    const input = document.createElement("input");
    document.querySelector(".svf-root")!.appendChild(input);
    fireEvent.keyDown(input, { key: "z", ctrlKey: true });
    expect(tile(1, 1).getAttribute("aria-label")).toContain("memo 3");
  });

  it("does nothing while Settings is open", () => {
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Memo 3"));
    fireEvent.click(tile(1, 1));
    fireEvent.click(first("Settings"));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    fireEvent.keyDown(dialog, { key: "z", ctrlKey: true });
    expect(tile(1, 1).getAttribute("aria-label")).toContain("memo 3");
  });

  it("does nothing during the quit confirmation", () => {
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Memo 3"));
    fireEvent.click(tile(1, 1));
    fireEvent.click(first("Quit"));
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "z", ctrlKey: true });
    expect(tile(1, 1).getAttribute("aria-label")).toContain("memo 3");
    expect(first("Undo last memo")).toBeDisabled();
  });
});

describe("the Lv.8 clock", () => {
  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  afterEach(() => {
    Reflect.deleteProperty(document, "hidden");
  });

  it("counts visible time from the first action, not hidden time", async () => {
    window.localStorage.setItem("svf:progress", JSON.stringify({ currentLevel: 8, totalScore: 0 }));
    vi.useFakeTimers();
    render(<SuperVoltorbFlipGame />);
    // Date jumps stand in for waiting: the clock reads Date.now, and running the
    // timers across a minute would only make the test slow under coverage.
    vi.setSystemTime(Date.now() + 60000); // idle before the first action: not counted
    const a = tile(0, 0);
    a.focus();
    fireEvent.keyDown(a, { key: "1" });
    vi.setSystemTime(Date.now() + 10000);
    act(() => setHidden(true));
    vi.setSystemTime(Date.now() + 100000);
    act(() => setHidden(false));
    vi.setSystemTime(Date.now() + 5000);
    quitRound();
    expect(savedStats().lv8Seconds).toBe(15);
  });
});

describe("highest level from the save", () => {
  it("reflects a loaded Lv.5 save before any round is played", () => {
    window.localStorage.setItem("svf:progress", JSON.stringify({ currentLevel: 5, totalScore: 0 }));
    render(<SuperVoltorbFlipGame />);
    expect(savedStats().highestLevel).toBe(5);
    expect(savedStats().rounds.played).toBe(0);
  });
});
