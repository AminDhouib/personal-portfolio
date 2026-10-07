import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
    const assist = screen.getByRole("switch", { name: /odds assist/i });
    expect(undo).toHaveAttribute("aria-checked", "true");
    expect(assist).toHaveAttribute("aria-checked", "false");
    fireEvent.click(assist);
    expect(onChange).toHaveBeenCalledWith({ assist: true });
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
    expect(within(dialog).getByText("Best daily streak")).toBeInTheDocument();
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
