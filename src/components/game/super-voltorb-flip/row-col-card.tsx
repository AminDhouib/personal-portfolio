"use client";

import { numberFont } from "./fonts";
import { COLORS } from "./types";
import { padDigits } from "./play-rules";
import { VoltorbIcon } from "./chrome";

// ---------------------------------------------------------------------------
// src/components/RowColCard.tsx (1:1 port).
// ---------------------------------------------------------------------------

type RowColCardProps = {
  coins: number;
  voltorbs: number;
  index: number;
};

export const RowColCard = ({ coins, voltorbs, index }: RowColCardProps) => {
  return (
    <div
      className={`${numberFont.className} relative z-[5] box-content flex h-[var(--svf-tile)] w-[var(--svf-tile)] flex-col rounded-sm outline outline-4 outline-gray-200 select-none`}
    >
      <div
        className="relative flex h-full w-full flex-col place-content-center place-items-center font-bold text-gray-800"
        style={{
          backgroundColor: COLORS[index],
          fontSize: "calc(var(--svf-tile) * 0.55)",
        }}
      >
        <div
          className="absolute right-0 text-end tracking-widest"
          style={{ top: "calc(var(--svf-tile) * -0.22)" }}
        >
          {padDigits(coins, 2)}
        </div>
        <div
          className="absolute w-full outline outline-2 outline-gray-200"
          style={{ top: "50%" }}
        />
        <div
          className="absolute flex items-center gap-0.5"
          style={{ bottom: "calc(var(--svf-tile) * -0.15)" }}
        >
          <VoltorbIcon cssSize="calc(var(--svf-tile) * 0.72)" className="voltorb object-contain" />
          <p style={{ transform: "translate(-1px, 2px)" }}>{voltorbs}</p>
        </div>
      </div>
    </div>
  );
};
