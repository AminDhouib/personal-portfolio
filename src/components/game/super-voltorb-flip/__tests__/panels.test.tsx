import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { SettingsPanel } from "../settings-panel";
import { StatsPanel } from "../stats-panel";
import { ModeRow } from "../mode-row";
import { EMPTY_STATS } from "../stats";

describe("SettingsPanel", () => {
  it("shows each setting as a labelled switch and reports changes", () => {
    const onChange = vi.fn();
    render(
      <SettingsPanel
        settings={{ memoUndo: true, stats: true, assist: false }}
        onChange={onChange}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    const undo = screen.getByRole("switch", { name: /memo undo/i });
    const stats = screen.getByRole("switch", { name: /statistics/i });
    expect(undo).toHaveAttribute("aria-checked", "true");
    expect(stats).toHaveAttribute("aria-checked", "true");
    fireEvent.click(stats);
    expect(onChange).toHaveBeenCalledWith({ stats: false });
  });

  it("does not offer the odds assist until it does something", () => {
    render(
      <SettingsPanel
        settings={{ memoUndo: true, stats: true, assist: false }}
        onChange={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("switch", { name: /odds assist/i })).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    vi.useFakeTimers();
    render(
      <SettingsPanel
        settings={{ memoUndo: true, stats: true, assist: false }}
        onChange={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    vi.advanceTimersByTime(200);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("closes from the close button", () => {
    const onClose = vi.fn();
    vi.useFakeTimers();
    render(
      <SettingsPanel
        settings={{ memoUndo: true, stats: true, assist: false }}
        onChange={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    vi.advanceTimersByTime(200);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("StatsPanel", () => {
  it("renders the empty record with dashes for what has no data", () => {
    render(<StatsPanel stats={EMPTY_STATS} onReset={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Statistics" });
    expect(within(dialog).getByText("Rounds played")).toBeInTheDocument();
    // Rows for features that do not exist yet stay hidden until they have data.
    expect(within(dialog).queryByText("Best daily streak")).toBeNull();
    expect(within(dialog).queryByText("Daily boards played")).toBeNull();
    expect(within(dialog).queryByText("Assisted rounds")).toBeNull();
  });

  it("shows the assisted and daily rows once they are non-zero", () => {
    render(
      <StatsPanel
        stats={{
          ...EMPTY_STATS,
          assistedRounds: 2,
          dailyPlayed: 3,
          streak: { current: 1, best: 2, lastDay: "2026-10-01" },
        }}
        onReset={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Assisted rounds")).toBeInTheDocument();
    expect(screen.getByText("Daily boards played")).toBeInTheDocument();
    expect(screen.getByText("Best daily streak")).toBeInTheDocument();
  });

  it("shows the numbers and asks before resetting", () => {
    const onReset = vi.fn();
    render(
      <StatsPanel
        stats={{
          ...EMPTY_STATS,
          rounds: { played: 5, won: 2, lost: 2, quit: 1 },
          assistedRounds: 1,
          coins: { total: 150, best: 96 },
          highestLevel: 4,
          lv8Seconds: 125,
        }}
        onReset={onReset}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("96")).toBeInTheDocument();
    expect(screen.getByText("2m 5s")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset statistics" }));
    expect(onReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, reset" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe("ModeRow", () => {
  it("offers Settings, and Statistics only when statistics are on", () => {
    const { rerender } = render(
      <ModeRow statsEnabled onOpenSettings={() => {}} onOpenStats={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Statistics" })).toBeInTheDocument();
    rerender(<ModeRow statsEnabled={false} onOpenSettings={() => {}} onOpenStats={() => {}} />);
    expect(screen.queryByRole("button", { name: "Statistics" })).toBeNull();
  });
});

describe("modal focus", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const settings = { memoUndo: true, stats: true, assist: false };

  it("moves focus into the dialog when it opens", () => {
    render(<SettingsPanel settings={settings} onChange={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("traps Tab and Shift+Tab inside the card", () => {
    render(<SettingsPanel settings={settings} onChange={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    const buttons = Array.from(dialog.querySelectorAll<HTMLElement>("button"));
    expect(buttons.length).toBeGreaterThan(2);
    const first = buttons[0]!;
    const last = buttons[buttons.length - 1]!;
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    // From the card itself, Shift+Tab also wraps to the last control.
    (document.activeElement as HTMLElement).blur();
    const card = dialog.querySelector<HTMLElement>(".svf-modal-card")!;
    card.focus();
    fireEvent.keyDown(card, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("returns focus to the opener when it closes", () => {
    vi.useFakeTimers();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>open</button>
          {open && (
            <SettingsPanel settings={settings} onChange={() => {}} onClose={() => setOpen(false)} />
          )}
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole("button", { name: "open" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("calls onClose once however many times it is closed", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<SettingsPanel settings={settings} onChange={() => {}} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(window, { key: "Escape" });
    vi.advanceTimersByTime(500);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose after it unmounts mid-close", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { unmount } = render(
      <SettingsPanel settings={settings} onChange={() => {}} onClose={onClose} />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    unmount();
    vi.advanceTimersByTime(500);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("gives the close button a 44px touch target", () => {
    render(<SettingsPanel settings={settings} onChange={() => {}} onClose={() => {}} />);
    const cls = screen.getByRole("button", { name: "Close" }).className;
    expect(cls).toContain("h-11");
    expect(cls).toContain("w-11");
  });
});
describe("focus stays in the dialog", () => {
  it("moves focus to Keep it after Reset, and back to Reset after", () => {
    render(<StatsPanel stats={EMPTY_STATS} onReset={() => {}} onClose={() => {}} />);
    const reset = screen.getByRole("button", { name: "Reset statistics" });
    reset.focus();
    fireEvent.click(reset);
    const keep = screen.getByRole("button", { name: "Keep it" });
    expect(document.activeElement).toBe(keep);
    fireEvent.click(keep);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Reset statistics" }));
  });

  it("moves focus back into the card after a confirmed reset", () => {
    render(<StatsPanel stats={EMPTY_STATS} onReset={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset statistics" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, reset" }));
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("pulls Tab back in when focus has fallen to the body", () => {
    render(
      <SettingsPanel
        settings={{ memoUndo: true, stats: true, assist: false }}
        onChange={() => {}}
        onClose={() => {}}
      />,
    );
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: "Tab" });
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });
});
