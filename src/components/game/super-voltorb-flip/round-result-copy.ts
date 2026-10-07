import { MAX_LEVEL } from "./hgss";

export type RoundKind = "win" | "lose" | "quit";

export type RoundResultCopyInput = {
  kind: RoundKind;
  fromLevel: number;
  toLevel: number;
  /** Coins banked this round; only a win or a quit pays. */
  coins: number;
};

function coinsText(coins: number): string {
  return `${coins} ${coins === 1 ? "coin" : "coins"}`;
}

/**
 * The two lines of the end-of-round banner. Original wording that follows the
 * game's flow: a win pays and moves up (or explains why it stays), a loss pays
 * nothing and drops, a quit banks what it has and drops the same way. The
 * detail stays short on purpose: the banner has a fixed height (72px on
 * phones, 60px from sm) and a long line would grow it.
 */
export function roundResultCopy({ kind, fromLevel, toLevel, coins }: RoundResultCopyInput): {
  title: string;
  detail: string;
} {
  const moved = toLevel !== fromLevel;
  if (kind === "win") {
    const title = `Round cleared! +${coinsText(coins)}`;
    if (moved) return { title, detail: `Moved up to Level ${toLevel}.` };
    if (toLevel >= MAX_LEVEL) return { title, detail: `Top level: Level ${toLevel}` };
    return {
      title,
      detail: `Staying on Level ${toLevel}. Five strong rounds in a row reach Level ${MAX_LEVEL}.`,
    };
  }
  const level = moved ? `Dropped to Level ${toLevel}.` : `Staying on Level ${toLevel}.`;
  if (kind === "lose") {
    return { title: "Voltorb! Round lost.", detail: `${level} No coins this round.` };
  }
  return coins > 0
    ? { title: `You quit. +${coinsText(coins)}`, detail: level }
    : { title: "You quit with no coins.", detail: level };
}
