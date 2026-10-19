import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import React from "react";

vi.mock("@copilotkit/react-ui/styles.css", () => ({}));
vi.mock("@copilotkit/react-core", () => ({
  CopilotKit: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useCopilotAction: vi.fn(),
  useCopilotReadable: vi.fn(),
}));
vi.mock("@copilotkit/react-ui", () => ({
  CopilotPopup: () => <div />,
  useCopilotChatSuggestions: vi.fn(),
}));

import { ChatWidgetPanel } from "../widget-panel";

function setReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("ChatWidgetPanel re-click attention ring", () => {
  let win: HTMLElement;
  let button: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    win = document.createElement("div");
    win.className = "copilotKitWindow";
    button = document.createElement("button");
    button.className = "copilotKitButton open";
    document.body.append(win, button);
  });

  afterEach(() => {
    cleanup();
    win.remove();
    button.remove();
    vi.useRealTimers();
  });

  function reclick(signal: number) {
    const view = render(<ChatWidgetPanel pathname="/" openSignal={signal} />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    return view;
  }

  it("adds the ring class once, with no interval, and removes it on animationend", () => {
    setReducedMotion(false);
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    reclick(1);
    expect(win.classList.contains("chat-attention")).toBe(true);
    expect(setIntervalSpy).not.toHaveBeenCalled();

    // Still present well past the old 1.4 s colour cycle: only animationend removes it.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(win.classList.contains("chat-attention")).toBe(true);

    act(() => {
      win.dispatchEvent(new Event("animationend"));
    });
    expect(win.classList.contains("chat-attention")).toBe(false);
  });

  it("can retrigger after the animation ended", () => {
    setReducedMotion(false);
    const first = reclick(1);
    act(() => {
      win.dispatchEvent(new Event("animationend"));
    });
    first.unmount();
    reclick(2);
    expect(win.classList.contains("chat-attention")).toBe(true);
  });

  it("under reduced motion shows the ring statically, then removes it after about 600 ms", () => {
    setReducedMotion(true);
    reclick(1);
    expect(win.classList.contains("chat-attention")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(win.classList.contains("chat-attention")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(win.classList.contains("chat-attention")).toBe(false);
  });
});
