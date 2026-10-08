import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PanelClose } from "../panel-close";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PanelClose", () => {
  it("is a 44 px button named by its label", () => {
    render(<PanelClose label="Close shop" onClose={() => {}} />);
    const button = screen.getByRole("button", { name: "Close shop" });
    expect(button.className).toContain("h-11");
    expect(button.className).toContain("w-11");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("calls onClose when clicked", () => {
    const onClose = vi.fn();
    render(<PanelClose label="Close settings" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
