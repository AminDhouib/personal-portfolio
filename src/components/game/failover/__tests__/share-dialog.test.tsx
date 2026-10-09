import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FailoverGame } from "../../failover";
import { decodeArchParam, encodeArchParam, type ArchWire } from "../persist/blueprint-schema";
import type { FailoverScene } from "../scene/scene";
import { dispatch } from "../sim/action-log";
import { S, resetSim } from "../sim/state";

// The ?arch= share link both ways: Share in Settings shows the live build as a
// link with a copy button, and opening a link shows what it holds, and what of
// it is not valid, before anything is built, and only through dispatch.

vi.mock("../scene/scene", () => ({
  createFailoverScene: (): FailoverScene => ({
    render: () => undefined,
    resize: () => undefined,
    setCamera: () => undefined,
    setOverlay: () => undefined,
    setTier: () => undefined,
    pick: () => null,
    dispose: () => undefined,
  }),
}));

class NoopObserver {
  observe() {}
  disconnect() {}
}

const PATH = "/games/failover";

/** The open dialog's own live line (the game has a toast line too). */
const status = () => within(screen.getByRole("dialog")).getByRole("status");

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("failover:coach", '{"v":1,"done":true}');
  window.history.replaceState(null, "", PATH);
  vi.stubGlobal("ResizeObserver", NoopObserver);
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
  resetSim({ seed: "share-dialog-reset" });
});

function openShare() {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  return screen.getByRole("dialog", { name: "Share Architecture" });
}

function buildWafLine() {
  act(() => {
    resetSim({ seed: "share-src", mode: "sandbox" });
    expect(dispatch({ op: 0, type: "waf", x: -28, z: 0 }).ok).toBe(true);
    expect(dispatch({ op: 0, type: "alb", x: -16, z: 0 }).ok).toBe(true);
    expect(dispatch({ op: 1, from: "internet", to: "svc_1" }).ok).toBe(true);
    expect(dispatch({ op: 1, from: "svc_1", to: "svc_2" }).ok).toBe(true);
  });
}

describe("Share", () => {
  it("shows the live build as a ?arch= link that decodes back to it", () => {
    render(<FailoverGame />);
    buildWafLine();
    openShare();
    const field = screen.getByRole("textbox", { name: "Link to this build" }) as HTMLInputElement;
    expect(field.readOnly).toBe(true);
    const url = new URL(field.value);
    expect(`${url.origin}${url.pathname}`).toBe(`${window.location.origin}${PATH}`);
    const arch = decodeArchParam(url.searchParams.get("arch"));
    expect(arch?.services.map((s) => s?.type)).toEqual(["waf", "alb"]);
    expect(arch?.internet).toEqual([0]);
    expect(arch?.connections).toEqual([[0, 1]]);
  });

  it("copies the link, and falls back to a selected field when the clipboard refuses", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<FailoverGame />);
    buildWafLine();
    openShare();
    const field = screen.getByRole("textbox", { name: "Link to this build" }) as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Copy Link" }));
    await waitFor(() => expect(status()).toHaveTextContent("Link copied to clipboard!"));
    expect(writeText).toHaveBeenCalledWith(field.value);

    writeText.mockRejectedValue(new Error("denied"));
    fireEvent.click(screen.getByRole("button", { name: "Copy Link" }));
    await waitFor(() => expect(status()).toHaveTextContent("copy it by hand"));
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
  });

  it("says when a build is too large to share, with no link", () => {
    render(<FailoverGame />);
    act(() => {
      resetSim({ seed: "share-big", mode: "sandbox", budget: 1_000_000 });
      for (let i = 0; i < 61; i++) {
        dispatch({ op: 0, type: "s3", x: (i % 11) * 4 - 20, z: Math.floor(i / 11) * 4 - 12 });
      }
    });
    expect(S.services.length).toBeGreaterThan(60);
    const dialog = openShare();
    expect(dialog).toHaveTextContent("This build is too large to fit in a link.");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy Link" })).toBeNull();
  });
});

function link(wire: unknown, extra = ""): string {
  const raw = typeof wire === "string" ? wire : encodeArchParam(wire as ArchWire);
  return `${PATH}?arch=${raw}${extra}`;
}

describe("opening a shared link", () => {
  const WIRE: ArchWire = {
    v: 1,
    b: 3000,
    t: ["waf", "alb", "nope", "compute"],
    p: [-28, 0, -16, 0, 0, 0, -4, 0],
    // waf -> alb is fine; alb -> nope has a dropped end; compute -> waf is not an allowed edge.
    c: [0, 1, 1, 2, 3, 0],
    i: [0],
  };

  it("says what the link holds and what it drops, then builds it only when asked", () => {
    window.history.replaceState(null, "", link(WIRE, "&from=x"));
    render(<FailoverGame />);
    const dialog = screen.getByRole("dialog", { name: "Shared build" });
    expect(dialog).toHaveTextContent("Services: 3. Links: 2.");
    expect(dialog).toHaveTextContent(
      "Not valid, so left out: 1 of the services and 2 of the links.",
    );
    // Nothing is built until the player says so.
    expect(S.services).toHaveLength(0);
    expect(S.gameMode).toBe("survival");

    fireEvent.click(screen.getByRole("button", { name: "Build it" }));
    return waitFor(() => {
      expect(S.gameMode).toBe("sandbox");
      expect(S.services.map((s) => s.type)).toEqual(["waf", "alb", "compute"]);
      expect(S.connections).toEqual([
        { from: "internet", to: "svc_1" },
        { from: "svc_1", to: "svc_2" },
      ]);
      expect(status()).toHaveTextContent("Services built: 3 of 3. Links made: 2.");
      expect(window.location.search).toBe("?from=x");
    });
  });

  it("builds through dispatch, so the board's own rules refuse what they refuse", async () => {
    window.history.replaceState(
      null,
      "",
      link({ v: 1, b: 3000, t: ["waf", "waf"], p: [0, 0, 0, 0], c: [], i: [0, 1] }),
    );
    render(<FailoverGame />);
    fireEvent.click(screen.getByRole("button", { name: "Build it" }));
    await waitFor(() =>
      expect(status()).toHaveTextContent("Refused by the board's rules: services 1, links 1."),
    );
    expect(S.services.map((s) => s.type)).toEqual(["waf"]);
    expect(S.log.length).toBeGreaterThan(0);
  });

  it("leaves the run as it was and clears the link on Cancel", () => {
    window.history.replaceState(null, "", link(WIRE));
    render(<FailoverGame />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Shared build" })).toBeNull();
    expect(S.services).toHaveLength(0);
    expect(window.location.search).toBe("");
  });

  it.each([
    ["not base64", "%%%"],
    ["not JSON", btoa("{nope")],
    ["a __proto__ payload", btoa('{"__proto__":{"v":1},"v":1,"t":[],"p":[],"c":[],"i":[]}')],
    [
      "5000 services",
      btoa(
        JSON.stringify({
          v: 1,
          b: 0,
          t: Array(5000).fill("waf"),
          p: Array(10000).fill(0),
          c: [],
          i: [],
        }),
      ),
    ],
    [
      "1e300 positions",
      btoa(JSON.stringify({ v: 1, b: 0, t: ["waf"], p: [1e300, 0], c: [], i: [0] })),
    ],
    ["a far too long value", "A".repeat(5000)],
  ])("refuses %s without a throw and builds nothing", (_, raw) => {
    window.history.replaceState(null, "", link(raw));
    render(<FailoverGame />);
    // 1e300 decodes, but to nothing: every entry is dropped, and an empty build is no build.
    expect(screen.getByRole("dialog", { name: "Shared build" })).toHaveTextContent(
      "does not hold a Failover build",
    );
    expect(screen.queryByRole("button", { name: "Build it" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(S.services).toHaveLength(0);
    expect(window.location.search).toBe("");
  });
});
