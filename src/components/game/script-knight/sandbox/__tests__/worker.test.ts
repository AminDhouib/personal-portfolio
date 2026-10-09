// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("worker entry", () => {
  it("registers one message listener and posts booted once the module has loaded", async () => {
    const postMessage = vi.fn();
    const addEventListener = vi.fn();
    vi.stubGlobal("self", { postMessage, addEventListener });
    await import("../worker");
    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(addEventListener.mock.calls[0]?.[0]).toBe("message");
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: "booted" });
  });

  it("answers a run message through the channel it captured at load", async () => {
    const postMessage = vi.fn();
    const addEventListener = vi.fn();
    const fakeSelf = { postMessage, addEventListener };
    vi.stubGlobal("self", fakeSelf);
    await import("../worker");
    const listener = addEventListener.mock.calls[0]?.[1] as (event: { data: unknown }) => void;
    // Even if the scope's own postMessage is gone, the captured one is used.
    const captured = postMessage;
    delete (fakeSelf as { postMessage?: unknown }).postMessage;
    listener({
      data: {
        type: "run",
        code: "class Player { playTurn(w) { w.walk(); } }",
        language: "javascript",
        level: { kind: "tower", tower: "narrow-path", level: 1, epic: false },
      },
    });
    expect(captured).toHaveBeenCalledWith({ type: "ready" });
    expect(captured).toHaveBeenLastCalledWith({ type: "done" });
  });
});
