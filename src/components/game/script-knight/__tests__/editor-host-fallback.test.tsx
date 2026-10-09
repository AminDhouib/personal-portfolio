import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorHost } from "../editor-host";

// The lazy chunk counts its own loads and then fails, so one mock shows both that a coarse pointer
// never imports it and that a failed import leaves the textarea working.
const loads = vi.hoisted(() => ({ count: 0 }));
vi.mock("../code-editor", () => {
  loads.count += 1;
  throw new Error("chunk failed");
});

const baseProps = { value: "class Player {}", onRun: vi.fn(), disabled: false };

beforeEach(() => {
  vi.stubGlobal("reportError", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EditorHost without a fine pointer", () => {
  it("never imports the chunk on a coarse pointer", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
    render(<EditorHost {...baseProps} onChange={vi.fn()} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loads.count).toBe(0);
    expect(screen.getByLabelText("Your Player code (JavaScript)")).toBeTruthy();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("never imports the chunk where matchMedia does not exist", async () => {
    vi.stubGlobal("matchMedia", undefined);
    render(<EditorHost {...baseProps} onChange={vi.fn()} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loads.count).toBe(0);
  });
});

describe("EditorHost when the chunk fails to load", () => {
  it("keeps a working textarea and reports once", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: fine)",
      media: query,
    }));
    const onChange = vi.fn();
    render(<EditorHost {...baseProps} onChange={onChange} />);
    await waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
    expect(loads.count).toBe(1);
    fireEvent.change(screen.getByLabelText("Your Player code (JavaScript)"), {
      target: { value: "x" },
    });
    expect(onChange).toHaveBeenCalledWith("x");
  });
});
