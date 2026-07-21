import type { EventContext, EventDef, EventInstance, Pg2RuleDef } from "../types";
import { setCellStatus } from "../cells";
import { pickOne } from "../rng";
import type { GeraldData } from "./gerald";

/**
 * The snake. It slithers in and, every BITE_PERIOD_MS, swallows the LAST still-normal
 * cell (status "abducted", excluded from the value). It has a sweet tooth: type its
 * pellet glyph while the caret sits at the very end of the box and it eats the pellet
 * instead of the char (a feed, not an insert). Feed it three times, or let it swallow
 * eight letters, and it leaves satisfied — raining every swallowed letter back in
 * place. The coupled rule refuses submit while any letter is still inside the snake.
 */

const EVENT_ID = "snake";
const TELEGRAPH_MS = 6000;
const BITE_PERIOD_MS = 5000;
const SATED_TO_LEAVE = 3;
const SWALLOWED_TO_LEAVE = 8;
const PELLETS = ["o", "0", "@"] as const;
const GERALD_CALM_HUNGER_MAX = 40; // chain 6: a fish at or below this hunger is well fed
const CALM_BITE_SCALE = 1.5; // chain 6: a fed fish stretches the next bite this much further out

export interface SnakeData {
  swallowedIds: number[]; // cell ids swallowed, in bite order
  sated: number; // successful pellet feeds
  nextBiteAtMs: number; // state.elapsedMs of the next bite
  pelletChar: string; // the glyph that feeds it
  gone: boolean; // set once it has slithered off
  calmMooded: boolean; // chain 6: the "keeps its distance" mood has fired for this instance
}

/** Swallow the last still-normal cell, if any. */
function biteLast(d: SnakeData, ctx: EventContext): void {
  const cells = ctx.state.cells;
  for (let i = cells.length - 1; i >= 0; i--) {
    const cell = cells[i]!;
    if (cell.status === "normal") {
      ctx.state.cells = setCellStatus(cells, cell.id, "abducted", EVENT_ID);
      d.swallowedIds.push(cell.id);
      ctx.state.stats.lettersAbducted++;
      return;
    }
  }
}

/** Once sated or full, rain every swallowed letter back in place and slither off. */
function maybeLeave(d: SnakeData, ctx: EventContext, inst: EventInstance<SnakeData>): void {
  if (d.gone) return;
  if (d.sated < SATED_TO_LEAVE && d.swallowedIds.length < SWALLOWED_TO_LEAVE) return;
  let cells = ctx.state.cells;
  let count = 0;
  for (const cell of cells) {
    if (cell.status === "abducted" && cell.eventTag === EVENT_ID) {
      cells = setCellStatus(cells, cell.id, "normal");
      count++;
    }
  }
  ctx.state.cells = cells;
  ctx.state.stats.lettersRescued += count;
  d.gone = true;
  inst.phase = "done";
  ctx.emit({ kind: "toast", tone: "success", text: "The snake slithers off, satisfied." });
}

/**
 * The bear's swipe (chain 3): shove the snake's next bite one whole interval later.
 * nextBiteAtMs is always the FUTURE bite, so this never retro-shifts one that already
 * landed. A snake that has slithered off has nothing left to delay.
 */
export function bearSwipe(inst: EventInstance<SnakeData>, _ctx: EventContext): boolean {
  const d = inst.data;
  if (d.gone) return false;
  d.nextBiteAtMs += BITE_PERIOD_MS;
  return true;
}

/**
 * Chain 6: a well-fed Gerald calms the snake, so the NEXT bite is scheduled CALM_BITE_SCALE
 * further out. Reads Gerald via the sanctioned cross-event idiom (see autocorrect.ts
 * sabotage(), garden.ts swipeInvaders()): a fish in telegraph or done (or not yet inited) is
 * not a live calmer, so the snake keeps its base cadence. A pure read of Gerald's hunger at
 * schedule time — no rng, and because it only sizes the interval added to the FUTURE bite it
 * never retro-shifts one already scheduled, so determinism holds. Moods once per instance the
 * first time the calm actually applies.
 */
function biteIntervalMs(d: SnakeData, ctx: EventContext): number {
  const fish = ctx.state.events.find((e) => e.defId === "gerald");
  if (!fish || fish.phase === "telegraph" || fish.phase === "done" || fish.data === undefined) {
    return BITE_PERIOD_MS;
  }
  const g = fish.data as GeraldData;
  if (g.hunger > GERALD_CALM_HUNGER_MAX) return BITE_PERIOD_MS;
  if (!d.calmMooded) {
    d.calmMooded = true;
    ctx.emit({
      kind: "mood",
      eventId: EVENT_ID,
      text: "The snake keeps its distance from a fed fish.",
    });
  }
  return BITE_PERIOD_MS * CALM_BITE_SCALE;
}

/** Coupled rule: nothing may still be inside the snake at submit. */
const snakeFedRule: Pg2RuleDef = {
  id: "snake-fed",
  act: "act3",
  create: () => ({
    id: "snake-fed",
    act: "act3",
    description:
      "Nothing may remain inside the snake when you submit — type its snack at the end of the box to feed it.",
    validate: (_password, state, api) => {
      const d = api.getEventData<SnakeData>(EVENT_ID);
      if (d === null) return { passed: true }; // no snake this run: a freebie
      const swallowed = state.cells.some((c) => c.status === "abducted" && c.eventTag === EVENT_ID);
      return {
        passed: !swallowed,
        message: swallowed ? "The snake is still digesting your letters" : undefined,
      };
    },
  }),
};

export const snakeDef: EventDef<SnakeData> = {
  id: EVENT_ID,
  family: "invasion",
  telegraphMs: TELEGRAPH_MS,
  coupledRule: snakeFedRule,
  init: (rng) => ({
    swallowedIds: [],
    sated: 0,
    nextBiteAtMs: 0,
    pelletChar: pickOne(rng, PELLETS),
    gone: false,
    calmMooded: false,
  }),
  onTick(inst: EventInstance<SnakeData>, ctx: EventContext): void {
    const d = inst.data;
    if (inst.phase === "telegraph") {
      if (inst.phaseElapsedMs <= ctx.dtMs) ctx.emit({ kind: "sound", sound: "telegraph-doom" });
      if (inst.phaseElapsedMs >= TELEGRAPH_MS) {
        inst.phase = "onset";
        d.nextBiteAtMs = ctx.state.elapsedMs + BITE_PERIOD_MS;
        ctx.emit({ kind: "sound", sound: "invasion-onset" });
      }
      return;
    }
    if (inst.phase === "onset") inst.phase = "peak";
    while (ctx.state.elapsedMs >= d.nextBiteAtMs) {
      biteLast(d, ctx);
      // chain 6: a fed Gerald stretches the next bite; biteIntervalMs also emits the calm
      // mood once on the first slowed schedule (not a pure getter, despite its shape).
      d.nextBiteAtMs += biteIntervalMs(d, ctx);
    }
    maybeLeave(d, ctx, inst);
  },
  onKey(inst: EventInstance<SnakeData>, ctx: EventContext, key: string): boolean {
    const d = inst.data;
    // A pellet at the very end of the box is a feed, not a keystroke: consume it.
    if (key === d.pelletChar && ctx.state.caret === ctx.state.cells.length) {
      d.sated++;
      ctx.emit({ kind: "sound", sound: "snake-chomp" });
      maybeLeave(d, ctx, inst);
      return true;
    }
    return false; // anywhere else it inserts normally
  },
  isResolved: (inst) => inst.data.gone,
};
