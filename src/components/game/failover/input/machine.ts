import type { ServiceType } from "../sim/config";
import type { LinkRefusal } from "../sim/topology";
import type { KeyCommand } from "./keys";

// The pointer and keyboard model, as a pure state machine:
// (state, event) -> { state, intent }. The controller turns intents into sim
// actions and camera moves; nothing here touches the sim, the scene or the DOM.
//
// A mouse acts on click. A finger asks first: a placement shows a ghost to
// confirm, a demolish waits for a confirm. While two fingers are down the
// board is being panned or pinched, so no tap there means anything.

export type Tool =
  | { kind: "select" }
  | { kind: "place"; service: ServiceType }
  | { kind: "link" }
  | { kind: "demolish" };

export type Pointer = "mouse" | "touch";

type PlaceTool = Extract<Tool, { kind: "place" }>;
type LinkTool = Extract<Tool, { kind: "link" }>;
type DemolishTool = Extract<Tool, { kind: "demolish" }>;

export type MachineState =
  | { mode: "idle"; tool: Tool; gesturing: boolean }
  /** A placement waiting for confirm, shown as a ghost at x, z. */
  | { mode: "ghost"; tool: PlaceTool; x: number; z: number; gesturing: boolean }
  /** A link waiting for its target; `from` pulses. */
  | { mode: "linkFrom"; tool: LinkTool; from: string; gesturing: boolean }
  | { mode: "confirmDemolish"; tool: DemolishTool; id: string; gesturing: boolean };

export type MachineEvent =
  | { type: "tapCell"; x: number; z: number; pointer: Pointer }
  /** A node: "internet" or a service id. */
  | { type: "tapNode"; id: string; pointer: Pointer }
  | { type: "confirm" }
  | { type: "cancel" }
  | { type: "setTool"; tool: Tool }
  /** Two or more fingers down (true) or lifted (false). */
  | { type: "gesture"; active: boolean }
  | { type: "key"; command: KeyCommand };

export type Intent =
  | { kind: "none" }
  | { kind: "place"; service: ServiceType; x: number; z: number }
  | { kind: "link"; from: string; to: string }
  | { kind: "demolish"; id: string }
  /** Show a node's details, or close them (null). */
  | { kind: "inspect"; id: string | null }
  | { kind: "toast"; message: string }
  | { kind: "pan"; dx: number; dz: number }
  | { kind: "orbit"; dir: -1 | 1 }
  | { kind: "zoom"; dir: -1 | 1 }
  | { kind: "pause" }
  | { kind: "view" };

/** What the machine needs to know about the board, asked, never stored. */
export interface MachineContext {
  /** Why `from` may not link to `to` right now, or null when it may. */
  linkRefusal(from: string, to: string): LinkRefusal | "missing" | null;
  /** A node's display name. */
  label(id: string): string;
}

export interface MachineResult {
  state: MachineState;
  intent: Intent;
  /** The event was a game key: the caller may preventDefault it. */
  consumed: boolean;
}

const NONE: Intent = { kind: "none" };
const SELECT: Tool = { kind: "select" };

export function initialMachine(): MachineState {
  return { mode: "idle", tool: SELECT, gesturing: false };
}

function idle(tool: Tool, gesturing: boolean): MachineState {
  return { mode: "idle", tool, gesturing };
}

function out(state: MachineState, intent: Intent = NONE, consumed = false): MachineResult {
  return { state, intent, consumed };
}

function cancel(s: MachineState): MachineState {
  if (s.mode !== "idle") return idle(s.tool, s.gesturing);
  return idle(SELECT, s.gesturing);
}

function tapCell(s: MachineState, x: number, z: number, pointer: Pointer): MachineResult {
  const { tool, gesturing } = s;
  switch (tool.kind) {
    case "place":
      if (pointer === "mouse") {
        return out(idle(tool, gesturing), { kind: "place", service: tool.service, x, z });
      }
      return out({ mode: "ghost", tool, x, z, gesturing });
    case "select":
      return out(idle(tool, gesturing), { kind: "inspect", id: null });
    case "link":
    case "demolish":
      return out(idle(tool, gesturing));
  }
}

/**
 * A refused link, in words. A repeat of a link that is already there must not read as
 * "No route": the T8-2 walk took that for a missed click on the first, working, link.
 */
function linkRefusalText(
  refusal: LinkRefusal | "missing",
  from: string,
  to: string,
  ctx: MachineContext,
): string {
  const a = ctx.label(from);
  const b = ctx.label(to);
  switch (refusal) {
    case "exists":
      return `${a} already sends to ${b}`;
    case "reverse":
      return `${b} already sends to ${a}; a link runs one way`;
    case "self":
    case "missing":
    case "invalid":
      return `No route from ${a} to ${b}`;
  }
}

function tapNode(s: MachineState, id: string, pointer: Pointer, ctx: MachineContext) {
  const { tool, gesturing } = s;
  switch (tool.kind) {
    case "place":
      return out(idle(tool, gesturing), { kind: "toast", message: "That tile is taken" });
    case "select":
      return out(s, { kind: "inspect", id });
    case "demolish":
      if (id === "internet") {
        return out(idle(tool, gesturing), { kind: "toast", message: "The Internet stays" });
      }
      if (pointer === "mouse") return out(idle(tool, gesturing), { kind: "demolish", id });
      return out({ mode: "confirmDemolish", tool, id, gesturing });
    case "link": {
      if (s.mode !== "linkFrom") return out({ mode: "linkFrom", tool, from: id, gesturing });
      if (s.from === id) return out(idle(tool, gesturing));
      const refusal = ctx.linkRefusal(s.from, id);
      if (refusal === null) {
        return out(idle(tool, gesturing), { kind: "link", from: s.from, to: id });
      }
      return out(s, { kind: "toast", message: linkRefusalText(refusal, s.from, id, ctx) });
    }
  }
}

function confirm(s: MachineState): MachineResult {
  if (s.mode === "ghost") {
    const intent: Intent = { kind: "place", service: s.tool.service, x: s.x, z: s.z };
    return out(idle(s.tool, s.gesturing), intent);
  }
  if (s.mode === "confirmDemolish") {
    return out(idle(s.tool, s.gesturing), { kind: "demolish", id: s.id });
  }
  return out(s);
}

function key(s: MachineState, command: KeyCommand): MachineResult {
  switch (command.kind) {
    case "pan":
      return out(s, { kind: "pan", dx: command.dx, dz: command.dz }, true);
    case "orbit":
      return out(s, { kind: "orbit", dir: command.dir }, true);
    case "zoom":
      return out(s, { kind: "zoom", dir: command.dir }, true);
    case "pause":
      return out(s, { kind: "pause" }, true);
    case "view":
      return out(s, { kind: "view" }, true);
    case "tool":
      return out(idle({ kind: command.tool }, s.gesturing), NONE, true);
    case "cancel":
      return out(cancel(s), NONE, true);
  }
}

export function next(s: MachineState, event: MachineEvent, ctx: MachineContext): MachineResult {
  switch (event.type) {
    case "gesture":
      return out({ ...s, gesturing: event.active });
    case "tapCell":
      return s.gesturing ? out(s) : tapCell(s, event.x, event.z, event.pointer);
    case "tapNode":
      return s.gesturing ? out(s) : tapNode(s, event.id, event.pointer, ctx);
    case "confirm":
      return confirm(s);
    case "cancel":
      return out(cancel(s));
    case "setTool":
      return out(idle(event.tool, s.gesturing));
    case "key":
      return key(s, event.command);
  }
}
