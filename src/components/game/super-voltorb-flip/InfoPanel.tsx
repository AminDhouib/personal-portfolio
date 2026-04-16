"use client";

import type { LineHint } from "./types";

const NUM = "/games/super-voltorb-flip/sprites/number";

function BoldDigit({ n }: { n: number }) {
  const idx = Math.max(0, Math.min(9, n));
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`${NUM}/bold_${idx}.png`}
      alt=""
      className="h-4 w-auto"
      style={{ imageRendering: "pixelated" as const }}
      draggable={false}
    />
  );
}

export function RowInfo({ hint }: { hint: LineHint }) {
  const tens = Math.floor(hint.points / 10);
  const ones = hint.points % 10;
  return (
    <div className="flex flex-col items-center justify-center gap-1 p-1 bg-white/10 rounded">
      <div className="flex gap-0.5">
        <BoldDigit n={tens} />
        <BoldDigit n={ones} />
      </div>
      <div className="h-px w-6 bg-white/40" />
      <BoldDigit n={hint.voltorbs} />
    </div>
  );
}

export function ColInfo({ hint }: { hint: LineHint }) {
  return <RowInfo hint={hint} />;
}
