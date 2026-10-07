import { MAX_LEVEL } from "./hgss";

export type RoundKind = "win" | "lose" | "quit";

export type RoundResultCopyInput = {
  kind: RoundKind;
  fromLevel: number;
  toLevel: number;
  /** Coins banked this round; only a win or a quit pays. */
  coins: number;
  /** The round was played with the odds assist on. */
  assisted?: boolean;
  /** The Daily board: one fixed board a day, no levels and no assist. */
  daily?: boolean;
};

const ASSISTED_NOTE = " Assisted: not in your record.";
const NEXT_BOARD = "A new board lands at 00:00 UTC.";

function coinsText(coins: number): string {
  return `${coins} ${coins === 1 ? "coin" : "coins"}`;
}

/**
 * The two lines of the end-of-round banner. Original wording that follows the
 * game's flow: a win pays and moves up (or explains why it stays), a loss pays
 * nothing and drops, a quit banks what it has and drops the same way. The
 * detail stays short on purpose: the banner has a fixed height (72px on
 * phones, 60px from sm) and a long line would grow it. An assisted round adds
 * one sentence to the detail and leaves the title alone.
 */
export function roundResultCopy(input: RoundResultCopyInput): { title: string; detail: string } {
  if (input.daily) return dailyCopy(input);
  const { title, detail } = baseCopy(input);
  return input.assisted ? { title, detail: `${detail}${ASSISTED_NOTE}` } : { title, detail };
}

// The Daily board never talks about levels, and never about assistance (there is none).
function dailyCopy({ kind, coins }: RoundResultCopyInput): { title: string; detail: string } {
  if (kind === "win") {
    return {
      title: `Board cleared! +${coinsText(coins)}`,
      detail: "Every coin on today's board. A new one lands at 00:00 UTC.",
    };
  }
  if (kind === "lose") {
    return { title: "Voltorb! Today's board is done.", detail: `No coins banked. ${NEXT_BOARD}` };
  }
  return coins > 0
    ? { title: `You quit. +${coinsText(coins)}`, detail: `Banked for today. ${NEXT_BOARD}` }
    : { title: "You quit with no coins.", detail: `Banked for today. ${NEXT_BOARD}` };
}

function baseCopy({ kind, fromLevel, toLevel, coins }: RoundResultCopyInput): {
  title: string;
  detail: string;
} {
  const moved = toLevel !== fromLevel;
  if (kind === "win") {
    const title = `Round cleared! +${coinsText(coins)}`;
    if (moved) return { title, detail: `Moved up to Level ${toLevel}.` };
    if (toLevel >= MAX_LEVEL) return { title, detail: `Top level: Level ${toLevel}.` };
    return {
      title,
      detail: `Staying on Level ${toLevel}. Five strong rounds in a row reach Level ${MAX_LEVEL}.`,
    };
  }
  // A quit counts as "not lost" for the level rule, so at Lv.5+ with a streak it
  // can climb: say which way the level actually went.
  const level =
    toLevel > fromLevel
      ? `Moved up to Level ${toLevel}.`
      : toLevel < fromLevel
        ? `Dropped to Level ${toLevel}.`
        : `Staying on Level ${toLevel}.`;
  if (kind === "lose") {
    return { title: "Voltorb! Round lost.", detail: `${level} No coins this round.` };
  }
  return coins > 0
    ? { title: `You quit. +${coinsText(coins)}`, detail: level }
    : { title: "You quit with no coins.", detail: level };
}
