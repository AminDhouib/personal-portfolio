// Pure helpers for the death card. No React, no storage.
import { SHIPS, COSMETICS } from "../shop-data";

/** Ease-out count from 0 to `target` over `durationMs`; always an integer. */
export function countUp(target: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return target;
  if (elapsedMs <= 0) return 0;
  const t = elapsedMs / durationMs;
  const eased = 1 - (1 - t) * (1 - t) * (1 - t);
  return Math.floor(target * eased);
}

export interface GoalItem {
  label: string;
  cost: number;
}

export interface BestBar {
  fraction: number;
  label: string;
  beaten: boolean;
}

export interface PostRunGoals {
  bar: BestBar | null;
  unlock: { label: string; coinsNeeded: number } | null;
}

/** Ships and cosmetics the player does not own yet and that cost coins. */
export function unownedCatalog(ownedCosmetics: readonly string[]): GoalItem[] {
  const items: GoalItem[] = [];
  for (const s of SHIPS) {
    if (s.unlockCost > 0 && !ownedCosmetics.includes(`ship:${s.id}`)) {
      items.push({ label: s.label, cost: s.unlockCost });
    }
  }
  for (const c of COSMETICS) {
    if (c.cost > 0 && !ownedCosmetics.includes(c.id)) items.push({ label: c.label, cost: c.cost });
  }
  return items;
}

export function postRunGoals(input: {
  score: number;
  previousBest: number | null;
  wallet: number;
  catalog: readonly GoalItem[];
}): PostRunGoals {
  const { score, previousBest, wallet, catalog } = input;

  let bar: BestBar | null = null;
  if (previousBest !== null && previousBest > 0) {
    if (score > previousBest) {
      bar = { fraction: 1, label: `New best by ${score - previousBest}`, beaten: true };
    } else if (score === previousBest) {
      bar = { fraction: 1, label: "Tied your best", beaten: false };
    } else {
      bar = {
        fraction: score / previousBest,
        label: `${previousBest - score} to beat your best`,
        beaten: false,
      };
    }
  }

  let unlock: PostRunGoals["unlock"] = null;
  const above = catalog.filter((i) => i.cost > wallet).sort((a, b) => a.cost - b.cost)[0];
  if (above) {
    unlock = { label: above.label, coinsNeeded: above.cost - wallet };
  } else {
    const ready = [...catalog].sort((a, b) => a.cost - b.cost)[0];
    if (ready) unlock = { label: ready.label, coinsNeeded: 0 };
  }
  return { bar, unlock };
}
