"use client";

import type { LineHint } from "./types";

export function RowInfo({ hint }: { hint: LineHint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 p-1 bg-white/10 rounded text-xs text-white">
      <div>{String(hint.points).padStart(2, "0")}</div>
      <div className="h-px w-6 bg-white/40" />
      <div>{hint.voltorbs}</div>
    </div>
  );
}

export function ColInfo({ hint }: { hint: LineHint }) {
  return <RowInfo hint={hint} />;
}
