"use client";

import { scoreFont } from "./fonts";
import { padDigits } from "./play-rules";
import { CoinSpinner } from "./chrome";

// ---------------------------------------------------------------------------
// src/components/Scoreboard.tsx (1:1 port).
// ---------------------------------------------------------------------------

type ScoreboardProps = {
  totalScore: number;
  currentScore: number;
};

export const Scoreboard = ({ currentScore, totalScore }: ScoreboardProps) => {
  return (
    <div className="flex w-full flex-col items-center gap-1 sm:gap-2">
      <div className="rounded-5 grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 border-2 border-gray-300 bg-white px-2 py-1 outline outline-2 outline-gray-600 sm:border-4">
        <CoinSpinner size={28} />
        <div className="drop-shadow-soft text-center text-sm leading-4 text-gray-600 sm:text-3xl sm:leading-7">
          Total
          <br />
          Coins
        </div>
        <p
          className={`${scoreFont.className} drop-shadow-soft flex text-3xl text-gray-700 sm:text-6xl`}
        >
          {padDigits(totalScore, 5)
            .split("")
            .map((d, i) => (
              <span key={i} className="inline-block text-center" style={{ width: "0.5em" }}>
                {d}
              </span>
            ))}
        </p>
      </div>
      <div className="rounded-5 grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 border-2 border-gray-300 bg-white px-2 py-1 outline outline-2 outline-gray-600 sm:border-4">
        <CoinSpinner size={28} />
        <div className="drop-shadow-soft text-center text-sm leading-4 text-gray-600 sm:text-3xl sm:leading-7">
          This
          <br />
          Game
        </div>
        <p
          className={`${scoreFont.className} drop-shadow-soft flex text-3xl text-gray-700 sm:text-6xl`}
        >
          {padDigits(currentScore, 5)
            .split("")
            .map((d, i) => (
              <span key={i} className="inline-block text-center" style={{ width: "0.5em" }}>
                {d}
              </span>
            ))}
        </p>
      </div>
    </div>
  );
};
