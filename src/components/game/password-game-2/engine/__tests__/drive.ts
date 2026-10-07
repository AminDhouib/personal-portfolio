import { applyKey, applyPointer, tick } from "../engine";
import { cellsToPassword } from "../cells";
import { CORE_RULES } from "../rules/index";
import { EVENT_DEFS } from "../events/index";
import { solveAll } from "./solve";
import type { GalagaData } from "../events/galaga";
import type { SnakeData } from "../events/snake";
import type { CookieBannerData } from "../events/cookie-banner";
import type { AutocorrectData } from "../events/autocorrect";
import type { ActId, EventInstance, GameState, RuleApi } from "../types";

/**
 * The scripted run driver shared by the engine integration test and the shell acceptance
 * test: solve the revealed roster, tend the crises, advance one 100ms frame. Deterministic
 * in run state.
 */

export const HHMM = "12:00";
export const TICK_MS = 100;

/** telegraphMs by def id, straight off the manifest. */
export const TELEGRAPH_MS = new Map(EVENT_DEFS.map((d) => [d.id, d.telegraphMs]));

/** Core-rule ids — the roster the solver drives; coupled inhabitant rules are tended. */
export const CORE_IDS = new Set(CORE_RULES.map((d) => d.id));

/** Coupled inhabitant rules injected at onset; satisfied by tending, not typing. */
export const COUPLED_INHAB_RULE_IDS = new Set(["gerald-fed", "campfire-burning", "garden-honey"]);

/** Count of revealed CORE rules (excludes coupled inhabitant rules). */
export const coreRevealed = (g: GameState) => g.rules.filter((r) => CORE_IDS.has(r.id)).length;

export const type = (g: GameState, s: string) => {
  for (const k of s) applyKey(g, k);
};

/** Replace the whole password through the public key API: clear to empty, then type. */
export const retype = (g: GameState, target: string) => {
  applyKey(g, "End");
  let guard = 0;
  while (g.cells.length > 0) {
    if (++guard > 500) throw new Error("retype: backspace loop exceeded 500 iterations");
    applyKey(g, "Backspace");
  }
  type(g, target);
};

export interface TendOpts {
  inhabitants?: boolean; // stoke/feed/basket the creatures (default true)
  forces?: boolean; // evict parasites; the black hole is handled via withHeavyWord (default true)
}

/**
 * Leading formation aliens left to dive (their letters are abducted, then rescued by
 * the key-shot); the rest are clicked down so a wave clears well inside its 45s cap.
 * With this budget every wave completes without a timeout on a fully-tended run, so
 * the final wave is shot down to the last invader and the coupled rule passes.
 */
export const GALAGA_DIVE_BUDGET = 8;

/**
 * Fight the invasions BEFORE the solver re-types (a retype backspaces the whole box,
 * which would delete the abducted cells the intruders are holding). Shoot every letter
 * Galaga is carrying, click down the formation aliens past the dive budget, feed the
 * snake its pellet at the end of the box, and shatter every Tetris block. Deterministic
 * in run state.
 */
export const tendInvasions = (g: GameState) => {
  for (const e of g.events) {
    if (e.data === undefined || e.phase === "telegraph" || e.phase === "done") continue;
    if (e.defId === "galaga") {
      const d = e.data as GalagaData;
      for (const a of d.aliens) {
        if (a.state === "carrying" && a.carriedCellId !== null) {
          const cell = g.cells.find((c) => c.id === a.carriedCellId);
          if (cell) applyKey(g, cell.ch);
        }
      }
      for (const a of d.aliens) {
        if (
          (a.state === "formation" || a.state === "diving") &&
          a.formationIndex >= GALAGA_DIVE_BUDGET
        ) {
          applyPointer(g, { kind: "alien", id: a.id });
        }
      }
    } else if (e.defId === "snake") {
      const d = e.data as SnakeData;
      if (!d.gone) {
        applyKey(g, "End");
        applyKey(g, d.pelletChar);
      }
    } else if (e.defId === "tetris") {
      for (const c of g.cells.filter((cell) => cell.status === "garbage")) {
        applyPointer(g, { kind: "cell", id: c.id });
      }
    }
  }
};

/**
 * Resolve the three chrome nuisances as fast as the player could. The loading bar has
 * seized the keyboard: mash a key each frame to push its fake upload along (its 12s cap
 * would resolve it regardless). The cookie banner: click the real reject-all the moment
 * one of the spawned banners carries it, otherwise decline the first banner to breed the
 * two that will eventually surface it. The autocorrect demon: open its settings and flip
 * the real off switch (its seeded slot) at once, killing it before it can mangle a rule.
 * Deterministic in run state.
 */
export const tendChrome = (g: GameState) => {
  for (const e of g.events) {
    if (e.data === undefined || e.phase === "telegraph" || e.phase === "done") continue;
    if (e.defId === "loading-bar") {
      applyKey(g, "x"); // mashed and swallowed while inputLocked
    } else if (e.defId === "cookie-banner") {
      const d = e.data as CookieBannerData;
      const real = d.banners.find((b) => b.hasRealReject);
      if (real) applyPointer(g, { kind: "banner-reject-all", id: real.id });
      else {
        const first = d.banners[0];
        if (first) applyPointer(g, { kind: "banner-decline", id: first.id });
      }
    } else if (e.defId === "autocorrect") {
      const d = e.data as AutocorrectData;
      if (!d.settingsOpen) applyPointer(g, { kind: "settings-gear" });
      applyPointer(g, { kind: "settings-toggle", id: d.correctToggleIndex });
    }
  }
};

/** Every non-inhabitant event scheduled for `act` has reached its terminal phase. */
export const nonInhabDone = (g: GameState, act: ActId): boolean =>
  g.events.filter((e) => e.act === act && nonInhabitant(e)).every((e) => e.phase === "done");

/**
 * Tend the live crises so the run stays winnable: stoke the campfire, feed Gerald,
 * toss the basket whenever the bear is not away, and evict any parasite mimic. The
 * black hole is collapsed by typing its heavy word (see withHeavyWord) and the
 * infection is cured by the solver (the no-infected strategy), so neither appears
 * here. Deterministic in run state. The campfire is stoked every frame (rate-limited
 * internally by its 1.5s cooldown) rather than on a slow cadence.
 */
export const tend = (g: GameState, opts: TendOpts = {}) => {
  const inhabitants = opts.inhabitants !== false;
  const forces = opts.forces !== false;
  for (const e of g.events) {
    if (e.data === undefined || e.phase === "telegraph" || e.phase === "done") continue;
    if (inhabitants && e.defId === "gerald") applyPointer(g, { kind: "feed-button" });
    else if (inhabitants && e.defId === "campfire") applyPointer(g, { kind: "stoke-button" });
    else if (inhabitants && e.defId === "garden") {
      const bearState = (e.data as { bearState: string }).bearState;
      if (bearState !== "away") applyPointer(g, { kind: "basket-button" });
    } else if (forces && e.defId === "parasite") {
      for (const c of g.cells.filter((cell) => cell.status === "parasite")) {
        applyPointer(g, { kind: "parasite", id: c.id });
      }
    }
  }
};

/** Append the black hole's heavy word to the solve target while it is still pulling. */
export const withHeavyWord = (g: GameState, target: string): string => {
  const bh = g.events.find(
    (e) =>
      e.defId === "black-hole" &&
      e.data !== undefined &&
      e.phase !== "telegraph" &&
      e.phase !== "done",
  );
  if (!bh) return target;
  const d = bh.data as { heavyWord: string; collapsingSinceMs: number | null };
  if (d.collapsingSinceMs !== null) return target;
  return target.includes(d.heavyWord) ? target : target + d.heavyWord;
};

/** Solve the revealed roster (retyping only on change), tend, then advance one frame. */
export const solveAndTick = (
  g: GameState,
  api: RuleApi,
  opts: {
    tendInhabitants?: boolean;
    tendForces?: boolean;
    tendInvasions?: boolean;
    tendChrome?: boolean;
  } = {},
) => {
  const tendForces = opts.tendForces !== false;
  if (opts.tendChrome !== false) tendChrome(g); // dismiss banners/toggles; mash the loading bar
  if (opts.tendInvasions !== false) tendInvasions(g); // shoot/feed/shatter before re-typing
  // While the loading bar holds the keyboard, NEVER solve or retype: the retype's
  // backspace loop would be swallowed as mash and spin until its cap throws. The bar
  // releases within its 12s deadline; tending and the tick continue meanwhile, and the
  // solver repairs any autocorrect damage on the next unlocked frame.
  if (!g.inputLocked) {
    const base = solveAll(g, api);
    const target = tendForces ? withHeavyWord(g, base) : base;
    if (target !== cellsToPassword(g.cells)) retype(g, target);
  }
  tend(g, { inhabitants: opts.tendInhabitants !== false, forces: tendForces });
  tick(g, TICK_MS);
};

export const nonInhabitant = (e: EventInstance) => e.family !== "inhabitant";
