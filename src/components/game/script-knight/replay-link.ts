import { decodeLog, encodeLog, type TurnAction } from "./engine/codec";
import type { LevelRef } from "./engine/level-ref";
import type { TowerId } from "./engine/towers";

// A replay link lives only in the URL fragment, so it is never sent to a server and needs no
// route. The log body is the action-log codec's own (the text after "1:"), not a second encoding.
//   #replay=1.d.<yyyymmdd>.<log>                    a daily floor
//   #replay=1.t.<np|pk>.<level>.<0|1>.<log>          a tower floor (epic 0 or 1)
// The log body can hold dots (an idle turn is ".-"), so the prefix is matched, not split.

/** A link is shorter than this many characters, fragment sign included. */
export const REPLAY_FRAGMENT_MAX = 600;

const PREFIX = "#replay=1.";
const DAILY = /^d\.(\d{4})(\d{2})(\d{2})\.(.+)$/;
const TOWER = /^t\.(np|pk)\.([1-9])\.([01])\.(.+)$/;
const TOWER_OF: Record<string, TowerId> = { np: "narrow-path", pk: "powder-keep" };
const CODE_OF: Record<TowerId, string> = { "narrow-path": "np", "powder-keep": "pk" };

export interface Replay {
  ref: LevelRef;
  actions: TurnAction[];
}

function isCalendarDay(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** The fragment for a run on a floor, "#replay=..." (hash sign included). */
export function buildReplayFragment(ref: LevelRef, actions: readonly TurnAction[]): string {
  const body = encodeLog(actions).slice(2);
  if (ref.kind === "daily") return `${PREFIX}d.${ref.day.replace(/-/g, "")}.${body}`;
  return `${PREFIX}t.${CODE_OF[ref.tower]}.${ref.level}.${ref.epic ? 1 : 0}.${body}`;
}

/** The replay a fragment describes, or null for anything that is not exactly one. */
export function parseReplayFragment(hash: string): Replay | null {
  if (typeof hash !== "string" || hash.length >= REPLAY_FRAGMENT_MAX) return null;
  if (!hash.startsWith(PREFIX)) return null;
  const rest = hash.slice(PREFIX.length);

  let ref: LevelRef;
  let body: string;
  const daily = DAILY.exec(rest);
  const tower = daily ? null : TOWER.exec(rest);
  if (daily) {
    const [, year = "", month = "", day = "", logBody = ""] = daily;
    if (!isCalendarDay(Number(year), Number(month), Number(day))) return null;
    ref = { kind: "daily", day: `${year}-${month}-${day}` };
    body = logBody;
  } else if (tower) {
    const [, code = "", level = "", epic = "", logBody = ""] = tower;
    const id = TOWER_OF[code];
    if (id === undefined) return null;
    ref = { kind: "tower", tower: id, level: Number(level), epic: epic === "1" };
    body = logBody;
  } else {
    return null;
  }

  const actions = decodeLog(`1:${body}`);
  if (actions === null || actions.length === 0) return null;
  return { ref, actions };
}
