import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShareButton } from "../toc-share";

describe("ShareButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  async function clickShare() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /share/i }));
    });
  }

  it("renders an empty persistent status region next to the button", () => {
    render(<ShareButton title="Post" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("");
    expect(screen.getByRole("button")).not.toContainElement(status);
  });

  it("announces the copy in the status region and reverts after the 2 s hold", async () => {
    render(<ShareButton title="Post" />);
    await clickShare();
    expect(screen.getByRole("status")).toHaveTextContent("Link copied");
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("keeps the button's width classes identical in both states", async () => {
    render(<ShareButton title="Post" />);
    const button = screen.getByRole("button");
    const idle = button.className;
    expect(idle).toContain("min-w-28");
    expect(idle).toContain("justify-center");

    await clickShare();
    expect(screen.getByRole("button").className).toBe(idle);
  });

  it("does not fade the server-rendered label, only the content that changes after a click", async () => {
    render(<ShareButton title="Post" />);
    expect(document.querySelector(".motion-fade-in")).toBeNull();
    await clickShare();
    expect(document.querySelector(".motion-fade-in")).not.toBeNull();
  });

  it("names the transitioned properties instead of transition-all", () => {
    render(<ShareButton title="Post" />);
    const className = screen.getByRole("button").className;
    expect(className).not.toContain("transition-all");
    expect(className).toContain("transition-[color,border-color,scale]");
    expect(className).toContain("motion-safe:active:scale-[0.98]");
  });
});
