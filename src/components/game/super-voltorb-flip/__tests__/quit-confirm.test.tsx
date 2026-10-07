import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QuitConfirm } from "../quit-confirm";

afterEach(cleanup);

describe("QuitConfirm", () => {
  it("states the coins a quit would bank and confirms", () => {
    const onConfirm = vi.fn();
    render(<QuitConfirm coins={48} onConfirm={onConfirm} onCancel={() => {}} />);
    expect(screen.getByRole("alertdialog", { name: "Quit this round?" })).toBeTruthy();
    expect(screen.getByText("Quit now and you keep 48 coins.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Quit" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("warns when the round has no coins yet", () => {
    render(<QuitConfirm coins={0} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText("You have not found any coins this round.")).toBeTruthy();
  });

  it("focuses Keep playing first and cancels on Escape", () => {
    const onCancel = vi.fn();
    render(<QuitConfirm coins={5} onConfirm={() => {}} onCancel={onCancel} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep playing" }));
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps Tab inside the two buttons", () => {
    render(<QuitConfirm coins={5} onConfirm={() => {}} onCancel={() => {}} />);
    const keep = screen.getByRole("button", { name: "Keep playing" });
    const quit = screen.getByRole("button", { name: "Quit" });
    quit.focus();
    fireEvent.keyDown(quit, { key: "Tab" });
    expect(document.activeElement).toBe(keep);
    fireEvent.keyDown(keep, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(quit);
  });

  it("does not let Enter or Escape reach listeners outside the dialog", () => {
    const outside = vi.fn();
    window.addEventListener("keydown", outside);
    render(<QuitConfirm coins={5} onConfirm={() => {}} onCancel={() => {}} />);
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    fireEvent.keyDown(document.activeElement as Element, { key: "Enter" });
    window.removeEventListener("keydown", outside);
    expect(outside).not.toHaveBeenCalled();
  });
});
