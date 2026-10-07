import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoBar, type MemoFlagSet } from "../memo-button";

afterEach(cleanup);

describe("MemoBar", () => {
  it("renders four flag buttons and a clear button, with no images", () => {
    const { container } = render(
      <MemoBar activeFlags={new Set() as MemoFlagSet} onToggle={() => {}} onClear={() => {}} />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("svg")).toHaveLength(5);
  });

  it("reflects the active set in aria-pressed", () => {
    render(
      <MemoBar
        activeFlags={new Set<1 | 2 | 3 | "V">([2, "V"]) as MemoFlagSet}
        onToggle={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Memo 2" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Memo V" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Memo 1" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("calls onToggle with the flag and onClear for the clear button", () => {
    const onToggle = vi.fn();
    const onClear = vi.fn();
    render(
      <MemoBar activeFlags={new Set() as MemoFlagSet} onToggle={onToggle} onClear={onClear} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Memo 3" }));
    expect(onToggle).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Clear all memo flags" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("grows the bar with the faces so a 44px face is a 44px target", () => {
    render(
      <MemoBar
        activeFlags={new Set() as MemoFlagSet}
        onToggle={() => {}}
        onClear={() => {}}
        size={44}
        fullWidth
        spread
      />,
    );
    const group = screen.getByRole("group", { name: "Memo flags" });
    expect(group.style.height).toBe("52px");
    expect(group.classList.contains("w-full")).toBe(true);
    expect(group.classList.contains("justify-between")).toBe(true);
    for (const button of screen.getAllByRole("button")) {
      const face = button.firstElementChild as HTMLElement;
      expect(face.style.width).toBe("44px");
      expect(face.style.height).toBe("44px");
    }
  });

  it("keeps the 44px bar for the desktop 32px faces and does not spread them", () => {
    render(
      <MemoBar
        activeFlags={new Set() as MemoFlagSet}
        onToggle={() => {}}
        onClear={() => {}}
        size={32}
        fullWidth
      />,
    );
    const group = screen.getByRole("group", { name: "Memo flags" });
    expect(group.style.height).toBe("44px");
    expect(group.classList.contains("justify-between")).toBe(false);
  });
});
