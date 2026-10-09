// @vitest-environment node
import { describe, expect, it } from "vitest";
import { keyCommand } from "../input/keys";
import {
  initialMachine,
  next,
  type MachineContext,
  type MachineEvent,
  type MachineState,
  type Tool,
} from "../input/machine";

const LABELS: Record<string, string> = {
  internet: "Internet",
  svc_1: "Firewall",
  svc_2: "Load Balancer",
  svc_3: "Relational DB",
};

// Internet -> Firewall -> Load Balancer is allowed; nothing reaches the database.
// Internet -> Load Balancer is already wired, so it and its reverse are refused.
const ctx: MachineContext = {
  linkRefusal: (from, to) => {
    if ((from === "internet" && to === "svc_1") || (from === "svc_1" && to === "svc_2")) {
      return null;
    }
    if (from === "internet" && to === "svc_2") return "exists";
    if (from === "svc_2" && to === "internet") return "reverse";
    return "invalid";
  },
  label: (id) => LABELS[id] ?? id,
};

const PLACE: Tool = { kind: "place", service: "compute" };
const LINK: Tool = { kind: "link" };
const DEMOLISH: Tool = { kind: "demolish" };

function run(state: MachineState, ...events: MachineEvent[]) {
  let s = state;
  const intents = [];
  for (const event of events) {
    const out = next(s, event, ctx);
    s = out.state;
    intents.push(out.intent);
  }
  return { state: s, intents };
}

const armed = (tool: Tool) => next(initialMachine(), { type: "setTool", tool }, ctx).state;

describe("the input machine", () => {
  it("starts idle on the select tool", () => {
    expect(initialMachine()).toEqual({ mode: "idle", tool: { kind: "select" }, gesturing: false });
  });

  describe("place", () => {
    it("a tap on an empty cell shows a ghost there; confirm places it", () => {
      const tap = next(armed(PLACE), { type: "tapCell", x: 8, z: -4, pointer: "touch" }, ctx);
      expect(tap.state).toEqual({ mode: "ghost", tool: PLACE, x: 8, z: -4, gesturing: false });
      expect(tap.intent).toEqual({ kind: "none" });

      const confirm = next(tap.state, { type: "confirm" }, ctx);
      expect(confirm.intent).toEqual({ kind: "place", service: "compute", x: 8, z: -4 });
      // The tool stays armed for the next one.
      expect(confirm.state).toEqual({ mode: "idle", tool: PLACE, gesturing: false });
    });

    it("a second tap moves the ghost; cancel drops it and keeps the tool", () => {
      const { state } = run(
        armed(PLACE),
        { type: "tapCell", x: 0, z: 0, pointer: "touch" },
        { type: "tapCell", x: 4, z: 4, pointer: "touch" },
      );
      expect(state).toMatchObject({ mode: "ghost", x: 4, z: 4 });
      expect(next(state, { type: "cancel" }, ctx).state).toEqual({
        mode: "idle",
        tool: PLACE,
        gesturing: false,
      });
    });

    it("a mouse click places at once (desktop)", () => {
      const out = next(armed(PLACE), { type: "tapCell", x: 12, z: 0, pointer: "mouse" }, ctx);
      expect(out.intent).toEqual({ kind: "place", service: "compute", x: 12, z: 0 });
      expect(out.state.mode).toBe("idle");
    });

    it("a tap on a node says the tile is taken", () => {
      const out = next(armed(PLACE), { type: "tapNode", id: "svc_1", pointer: "mouse" }, ctx);
      expect(out.intent).toEqual({ kind: "toast", message: "That tile is taken" });
    });
  });

  describe("link", () => {
    it("tap a source, then a valid target, gives a link", () => {
      const { state, intents } = run(
        armed(LINK),
        { type: "tapNode", id: "internet", pointer: "touch" },
        { type: "tapNode", id: "svc_1", pointer: "touch" },
      );
      expect(intents[0]).toEqual({ kind: "none" });
      expect(intents[1]).toEqual({ kind: "link", from: "internet", to: "svc_1" });
      expect(state).toEqual({ mode: "idle", tool: LINK, gesturing: false });
    });

    it("the source is held while it waits for a target", () => {
      const out = next(armed(LINK), { type: "tapNode", id: "svc_1", pointer: "mouse" }, ctx);
      expect(out.state).toEqual({ mode: "linkFrom", tool: LINK, from: "svc_1", gesturing: false });
    });

    it("an invalid target gives the reason and keeps the source", () => {
      const { state, intents } = run(
        armed(LINK),
        { type: "tapNode", id: "svc_1", pointer: "touch" },
        { type: "tapNode", id: "svc_3", pointer: "touch" },
      );
      expect(intents[1]).toEqual({
        kind: "toast",
        message: "Firewall can't send traffic to Relational DB.",
      });
      expect(state).toMatchObject({ mode: "linkFrom", from: "svc_1" });
    });

    it("a link that is already there says so, not No route, and keeps the source", () => {
      const exists = run(
        armed(LINK),
        { type: "tapNode", id: "internet", pointer: "mouse" },
        { type: "tapNode", id: "svc_2", pointer: "mouse" },
      );
      expect(exists.intents[1]).toEqual({
        kind: "toast",
        message: "Internet already sends to Load Balancer",
      });
      expect(exists.state).toMatchObject({ mode: "linkFrom", from: "internet" });

      const reverse = run(
        armed(LINK),
        { type: "tapNode", id: "svc_2", pointer: "mouse" },
        { type: "tapNode", id: "internet", pointer: "mouse" },
      );
      expect(reverse.intents[1]).toEqual({
        kind: "toast",
        message: "Internet already sends to Load Balancer; a link runs one way",
      });
    });

    it("tapping the source again, or an empty cell, cancels", () => {
      const again = run(
        armed(LINK),
        { type: "tapNode", id: "svc_1", pointer: "touch" },
        { type: "tapNode", id: "svc_1", pointer: "touch" },
      );
      expect(again.state).toEqual({ mode: "idle", tool: LINK, gesturing: false });
      expect(again.intents[1]).toEqual({ kind: "none" });

      const empty = run(
        armed(LINK),
        { type: "tapNode", id: "svc_1", pointer: "touch" },
        { type: "tapCell", x: 0, z: 0, pointer: "touch" },
      );
      expect(empty.state.mode).toBe("idle");
    });
  });

  describe("demolish", () => {
    it("a touch asks first, confirm demolishes", () => {
      const tap = next(armed(DEMOLISH), { type: "tapNode", id: "svc_2", pointer: "touch" }, ctx);
      expect(tap.state).toEqual({
        mode: "confirmDemolish",
        tool: DEMOLISH,
        id: "svc_2",
        gesturing: false,
      });
      expect(tap.intent).toEqual({ kind: "none" });
      expect(next(tap.state, { type: "confirm" }, ctx).intent).toEqual({
        kind: "demolish",
        id: "svc_2",
      });
    });

    it("a mouse click demolishes at once", () => {
      const out = next(armed(DEMOLISH), { type: "tapNode", id: "svc_2", pointer: "mouse" }, ctx);
      expect(out.intent).toEqual({ kind: "demolish", id: "svc_2" });
    });

    it("the Internet cannot be demolished", () => {
      const out = next(armed(DEMOLISH), { type: "tapNode", id: "internet", pointer: "mouse" }, ctx);
      expect(out.intent).toEqual({ kind: "toast", message: "The Internet stays" });
      expect(out.state.mode).toBe("idle");
    });
  });

  it("select: a tap on a node inspects it, on a cell clears", () => {
    expect(
      next(initialMachine(), { type: "tapNode", id: "svc_2", pointer: "touch" }, ctx).intent,
    ).toEqual({
      kind: "inspect",
      id: "svc_2",
    });
    expect(
      next(initialMachine(), { type: "tapCell", x: 0, z: 0, pointer: "touch" }, ctx).intent,
    ).toEqual({ kind: "inspect", id: null });
  });

  it("two-finger gestures never produce a tool intent", () => {
    for (const tool of [PLACE, LINK, DEMOLISH, { kind: "select" } as const]) {
      const { state, intents } = run(
        armed(tool),
        { type: "gesture", active: true },
        { type: "tapCell", x: 4, z: 0, pointer: "touch" },
        { type: "tapNode", id: "svc_1", pointer: "touch" },
        { type: "tapNode", id: "svc_2", pointer: "touch" },
      );
      expect(intents.every((i) => i.kind === "none")).toBe(true);
      expect(state).toEqual({ mode: "idle", tool, gesturing: true });
      expect(next(state, { type: "gesture", active: false }, ctx).state.gesturing).toBe(false);
    }
  });

  it("Escape cancels a pending step, then disarms the tool", () => {
    const linking = next(
      armed(LINK),
      { type: "tapNode", id: "svc_1", pointer: "touch" },
      ctx,
    ).state;
    const escape: MachineEvent = { type: "key", command: { kind: "cancel" } };
    const once = next(linking, escape, ctx);
    expect(once.state).toEqual({ mode: "idle", tool: LINK, gesturing: false });
    expect(once.consumed).toBe(true);
    const twice = next(once.state, escape, ctx);
    expect(twice.state).toEqual(initialMachine());
  });

  it("changing tool drops whatever was pending", () => {
    const ghost = next(armed(PLACE), { type: "tapCell", x: 0, z: 0, pointer: "touch" }, ctx).state;
    expect(next(ghost, { type: "setTool", tool: LINK }, ctx).state).toEqual({
      mode: "idle",
      tool: LINK,
      gesturing: false,
    });
  });

  it("view keys become view intents and leave the state alone", () => {
    const s = armed(LINK);
    const cases: [MachineEvent, unknown][] = [
      [
        { type: "key", command: { kind: "pan", dx: 1, dz: 0 } },
        { kind: "pan", dx: 1, dz: 0 },
      ],
      [
        { type: "key", command: { kind: "orbit", dir: -1 } },
        { kind: "orbit", dir: -1 },
      ],
      [
        { type: "key", command: { kind: "zoom", dir: 1 } },
        { kind: "zoom", dir: 1 },
      ],
      [{ type: "key", command: { kind: "pause" } }, { kind: "pause" }],
      [{ type: "key", command: { kind: "view" } }, { kind: "view" }],
    ];
    for (const [event, intent] of cases) {
      const out = next(s, event, ctx);
      expect(out.intent).toEqual(intent);
      expect(out.state).toBe(s);
      expect(out.consumed).toBe(true);
    }
  });

  it("tool keys arm the tool; select and link have keys, demolish too", () => {
    const out = next(
      initialMachine(),
      { type: "key", command: { kind: "tool", tool: "link" } },
      ctx,
    );
    expect(out.state).toEqual({ mode: "idle", tool: LINK, gesturing: false });
    expect(
      next(out.state, { type: "key", command: { kind: "tool", tool: "demolish" } }, ctx).state.tool,
    ).toEqual(DEMOLISH);
    expect(
      next(out.state, { type: "key", command: { kind: "tool", tool: "select" } }, ctx).state.tool,
    ).toEqual({ kind: "select" });
  });

  it("pointer events are not keys, so they never ask for preventDefault", () => {
    expect(
      next(armed(PLACE), { type: "tapCell", x: 0, z: 0, pointer: "mouse" }, ctx).consumed,
    ).toBe(false);
  });
});

describe("keyCommand", () => {
  it("maps WASD and the arrows to screen-relative pans", () => {
    expect(keyCommand("w")).toEqual({ kind: "pan", dx: 0, dz: -1 });
    expect(keyCommand("ArrowUp")).toEqual({ kind: "pan", dx: 0, dz: -1 });
    expect(keyCommand("S")).toEqual({ kind: "pan", dx: 0, dz: 1 });
    expect(keyCommand("ArrowDown")).toEqual({ kind: "pan", dx: 0, dz: 1 });
    expect(keyCommand("a")).toEqual({ kind: "pan", dx: -1, dz: 0 });
    expect(keyCommand("ArrowLeft")).toEqual({ kind: "pan", dx: -1, dz: 0 });
    expect(keyCommand("d")).toEqual({ kind: "pan", dx: 1, dz: 0 });
    expect(keyCommand("ArrowRight")).toEqual({ kind: "pan", dx: 1, dz: 0 });
  });

  it("maps Q/E to orbit, Space to pause, +/- to zoom, T to the view toggle", () => {
    expect(keyCommand("q")).toEqual({ kind: "orbit", dir: -1 });
    expect(keyCommand("E")).toEqual({ kind: "orbit", dir: 1 });
    expect(keyCommand(" ")).toEqual({ kind: "pause" });
    expect(keyCommand("+")).toEqual({ kind: "zoom", dir: 1 });
    expect(keyCommand("=")).toEqual({ kind: "zoom", dir: 1 });
    expect(keyCommand("-")).toEqual({ kind: "zoom", dir: -1 });
    expect(keyCommand("t")).toEqual({ kind: "view" });
  });

  it("maps the tool hotkeys and Escape", () => {
    expect(keyCommand("1")).toEqual({ kind: "tool", tool: "select" });
    expect(keyCommand("v")).toEqual({ kind: "tool", tool: "select" });
    expect(keyCommand("2")).toEqual({ kind: "tool", tool: "link" });
    expect(keyCommand("l")).toEqual({ kind: "tool", tool: "link" });
    expect(keyCommand("3")).toEqual({ kind: "tool", tool: "demolish" });
    expect(keyCommand("x")).toEqual({ kind: "tool", tool: "demolish" });
    expect(keyCommand("Delete")).toEqual({ kind: "tool", tool: "demolish" });
    expect(keyCommand("Escape")).toEqual({ kind: "cancel" });
  });

  it("leaves every other key to the page", () => {
    for (const key of ["Tab", "Enter", "PageDown", "Home", "f", "F5", "Shift"]) {
      expect(keyCommand(key)).toBeNull();
    }
  });
});
