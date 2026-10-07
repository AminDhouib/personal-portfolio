"use client";

import { useEffect, useRef } from "react";
import { roundResultCopy } from "./round-result-copy";

export type RoundResultProps = {
  kind: "win" | "lose" | "quit";
  fromLevel: number;
  toLevel: number;
  /** Coins banked this round; shown for a win or a quit. */
  coins?: number;
  /** The round was played with the odds assist on: the detail line says it does not count. */
  assisted?: boolean;
  /** The Daily board: the copy drops levels and the button reads "See results". */
  daily?: boolean;
  onContinue: () => void;
};

/**
 * End-of-round banner for Super Voltorb Flip. It fills the result slot under
 * the board at the same height as the slot's idle line, so it neither covers
 * tiles nor shifts layout: 72px on phones, where a long win title such as
 * "Round cleared! +12345 coins" wraps to two lines, and 60px from sm up.
 * The detail line reports the level move (see round-result-copy.ts). Styled
 * like the game's other light chrome (white card, grey outline, green action
 * button).
 */
export function RoundResult({
  kind,
  fromLevel,
  toLevel,
  coins = 0,
  assisted,
  daily,
  onContinue,
}: RoundResultProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  const { title, detail } = roundResultCopy({
    kind,
    fromLevel,
    toLevel,
    coins,
    assisted,
    daily,
  });

  return (
    <div className="rounded-5 flex min-h-[72px] items-center gap-2 border-2 border-gray-300 bg-white px-2 py-1.5 text-gray-700 shadow-[0_4px_0_rgba(0,0,0,0.18)] outline outline-2 outline-gray-600 sm:min-h-[60px]">
      <div className="min-w-0 flex-1 leading-tight" role="status">
        <p
          className={`text-sm font-bold sm:text-base ${kind === "lose" ? "text-[#b3261e]" : "text-[#2f6b4b]"}`}
        >
          {title}
        </p>
        <p className="text-xs text-gray-500 sm:text-sm">{detail}</p>
      </div>
      <button
        ref={buttonRef}
        type="button"
        onClick={onContinue}
        className="drop-shadow-default min-h-11 min-w-11 shrink-0 cursor-pointer rounded-[6px] border-2 border-white bg-[#3D7757] px-3 text-sm font-bold text-white outline outline-2 outline-gray-600 focus-visible:outline-[#ef2020]"
      >
        {daily ? "See results" : kind === "lose" ? "Continue" : "Next round"}
      </button>
    </div>
  );
}
