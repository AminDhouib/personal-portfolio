import type { VoltorbFlip } from "./engine";
import { formatOdds, type Revealed, type SolverInput, type TileOdds } from "./solver";

/**
 * The solver's input for the live board: the clue cards plus the tiles already
 * flipped. A round that is still running has no flipped Voltorb, so only 1, 2
 * and 3 appear as revealed values. Null for any board but 5x5 (the solver and
 * the HGSS deal are 5x5; ?size=N boards are a dev tool).
 */
export function buildSolverInput(game: VoltorbFlip): SolverInput | null {
  if (game.cells.length !== 5) return null;
  const revealed: Revealed[] = game.cells
    .flat()
    .map((cell) =>
      cell.isFlipped && (cell.value === 1 || cell.value === 2 || cell.value === 3)
        ? cell.value
        : null,
    );
  return {
    rows: game.rowValues.map((r) => ({ coins: r.coins, voltorbs: r.voltorbs })),
    cols: game.colValues.map((c) => ({ coins: c.coins, voltorbs: c.voltorbs })),
    revealed,
    level: game.currentLevel,
  };
}

export type TileOddsView = { text: string; spoken: string; best: boolean };

/**
 * The odds badge for tile `index`, or undefined when it must not show: no odds
 * yet, the tile is flipped, the peek debug view is on, or the board is
 * flipping down (the same gates the memo marks use). Odds never go on a
 * revealed tile: its value is already known.
 */
export function tileOddsView(
  odds: { tiles: readonly TileOdds[]; best: number | null } | null | undefined,
  index: number,
  gate: { flipped: boolean; peek: boolean; flipDown: boolean },
): TileOddsView | undefined {
  if (!odds || gate.flipped || gate.peek || gate.flipDown) return undefined;
  const tile = odds.tiles[index];
  if (!tile) return undefined;
  return { ...oddsView(tile), best: odds.best === index };
}

/** What a face-down tile shows (the Voltorb chance) and what a screen reader hears. */
export function oddsView(odds: TileOdds): { text: string; spoken: string } {
  const text = formatOdds(odds.voltorb);
  if (text === "0%") return { text, spoken: "no chance of a Voltorb" };
  if (text === "100%") return { text, spoken: "certainly a Voltorb" };
  if (text === "<1%") return { text, spoken: "under 1 percent Voltorb" };
  if (text === ">99%") return { text, spoken: "over 99 percent Voltorb" };
  return { text, spoken: `${text.replace("%", "")} percent Voltorb` };
}
