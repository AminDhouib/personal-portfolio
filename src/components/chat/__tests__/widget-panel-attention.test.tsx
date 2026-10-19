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

function ringEnd() {
  return Object.assign(new Event("animationend"), { animationName: "chat-attention-ring" });
}

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

  function reclick(signal: number, initiallyOpen?: boolean) {
    const view = render(
      <ChatWidgetPanel pathname="/" openSignal={signal} initiallyOpen={initiallyOpen} />,
    );
    act(() => {
      vi.advanceTimersByTime(0);
    });
    return view;
  }

  it("adds the ring class once, with no interval, and removes it on its own animationend", () => {
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
      win.dispatchEvent(ringEnd());
    });
    expect(win.classList.contains("chat-attention")).toBe(false);
  });

  it("ignores a bubbling animationend from a child (a reply fading in) mid-pulse", () => {
    setReducedMotion(false);
    const child = document.createElement("div");
    win.append(child);
    reclick(1);
    act(() => {
      child.dispatchEvent(
        Object.assign(new Event("animationend", { bubbles: true }), {
          animationName: "message-fade-in",
        }),
      );
    });
    expect(win.classList.contains("chat-attention")).toBe(true);

    // The ring's own name bubbling up from a descendant is not the window's ring either.
    act(() => {
      child.dispatchEvent(
        Object.assign(new Event("animationend", { bubbles: true }), {
          animationName: "chat-attention-ring",
        }),
      );
    });
    expect(win.classList.contains("chat-attention")).toBe(true);

    // An unrelated animation ending on the window itself does not clear it either.
    act(() => {
      win.dispatchEvent(Object.assign(new Event("animationend"), { animationName: "other" }));
    });
    expect(win.classList.contains("chat-attention")).toBe(true);
  });

  it("does not ring on the first open of a mount that starts open, but does on a later signal", () => {
    setReducedMotion(false);
    const view = reclick(1, true);
    expect(win.classList.contains("chat-attention")).toBe(false);

    view.rerender(<ChatWidgetPanel pathname="/" openSignal={2} initiallyOpen />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(win.classList.contains("chat-attention")).toBe(true);
  });

  it("can retrigger after the animation ended", () => {
    setReducedMotion(false);
    const first = reclick(1);
    act(() => {
      win.dispatchEvent(ringEnd());
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
