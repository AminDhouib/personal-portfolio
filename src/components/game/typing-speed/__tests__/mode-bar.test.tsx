import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModeBar } from "../mode-bar";

afterEach(cleanup);

function bar(mode: Parameters<typeof ModeBar>[0]["mode"], onChange = vi.fn()) {
  render(<ModeBar mode={mode} onChange={onChange} />);
  return { group: screen.getByRole("group", { name: "Mode" }), onChange };
}

describe("ModeBar", () => {
  it("offers content, durations, the single quote and the daily", () => {
    const { group } = bar("words-30");
    const names = within(group)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual(["Words", "Quotes", "15", "30", "60", "120", "Quote", "Daily"]);
  });
  it("marks the buttons that match the current mode as pressed", () => {
    const { group } = bar("quotes-60");
    const pressed = within(group)
      .getAllByRole("button", { pressed: true })
      .map((b) => b.textContent);
    expect(pressed).toEqual(["Quotes", "60"]);
  });
  it("marks only Quote as pressed in the single-quote mode", () => {
    const { group } = bar("quote");
    const pressed = within(group)
      .getAllByRole("button", { pressed: true })
      .map((b) => b.textContent);
    expect(pressed).toEqual(["Quote"]);
  });
  it("marks only Daily as pressed in the daily mode, and picks it", () => {
    const { group, onChange } = bar("daily");
    const pressed = within(group)
      .getAllByRole("button", { pressed: true })
      .map((b) => b.textContent);
    expect(pressed).toEqual(["Daily"]);
    fireEvent.click(screen.getByRole("button", { name: "Daily" }));
    expect(onChange).toHaveBeenCalledWith("daily");
  });
  it("leaves the daily for a timed mode at 30 seconds", () => {
    const { onChange } = bar("daily");
    fireEvent.click(screen.getByRole("button", { name: "Words" }));
    expect(onChange).toHaveBeenLastCalledWith("words-30");
  });
  it("changes the duration and keeps the content", () => {
    const { onChange } = bar("words-30");
    fireEvent.click(screen.getByRole("button", { name: "60 seconds" }));
    expect(onChange).toHaveBeenCalledWith("words-60");
  });
  it("changes the content and keeps the duration", () => {
    const { onChange } = bar("words-60");
    fireEvent.click(screen.getByRole("button", { name: "Quotes" }));
    expect(onChange).toHaveBeenCalledWith("quotes-60");
  });
  it("leaves the single quote for a timed mode at 30 seconds, or the picked duration", () => {
    const { onChange } = bar("quote");
    fireEvent.click(screen.getByRole("button", { name: "Words" }));
    expect(onChange).toHaveBeenLastCalledWith("words-30");
    fireEvent.click(screen.getByRole("button", { name: "120 seconds" }));
    expect(onChange).toHaveBeenLastCalledWith("words-120");
    fireEvent.click(screen.getByRole("button", { name: "Quote" }));
    expect(onChange).toHaveBeenLastCalledWith("quote");
  });
  it("every button is a 44px sans-serif target", () => {
    const { group } = bar("words-30");
    for (const b of within(group).getAllByRole("button")) {
      expect(b).toHaveClass("min-h-11", "min-w-11", "font-sans");
    }
  });
});
