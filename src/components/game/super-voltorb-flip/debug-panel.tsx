"use client";

import { useState } from "react";

export function DebugPanel({
  size,
  onSizeChange,
  onWinLevel,
  peek,
  onPeekToggle,
}: {
  size: number;
  onSizeChange: (n: number) => void;
  onWinLevel: () => void;
  peek: boolean;
  onPeekToggle: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open debug panel"
        title="Debug panel"
        className="fixed right-3 bottom-3 z-50 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/70 px-3 py-1.5 font-mono text-xs text-white/80 shadow-lg backdrop-blur hover:bg-black/85"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M19.14 12.94a7.49 7.49 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.13.55-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.67 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.05.31-.08.62-.08.94s.03.63.08.94L2.79 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.33.68.22l2.39-.96c.49.39 1.04.7 1.62.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.58-.24 1.13-.55 1.62-.94l2.39.96c.26.11.54.02.68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.19-1.58ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
        </svg>
        debug
      </button>
    );
  }

  return (
    <div
      className="fixed right-3 bottom-3 z-50 w-64 rounded-lg border border-white/20 bg-black/85 p-3 font-mono text-xs text-white shadow-xl backdrop-blur"
      role="dialog"
      aria-label="Debug panel"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <span className="font-bold tracking-widest uppercase">Debug</span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close debug panel"
          className="rounded px-2 text-lg leading-none text-white/60 hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </div>

      <div className="space-y-3 pt-3">
        <div>
          <div className="mb-1 text-white/60">Grid size</div>
          <div className="flex gap-1">
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
              const active = size === n;
              return (
                <button
                  key={n}
                  onClick={() => onSizeChange(n)}
                  aria-pressed={active}
                  className={`flex-1 rounded border py-1 font-bold transition-colors ${
                    active
                      ? "border-emerald-300 bg-emerald-400/20 text-emerald-100"
                      : "border-white/20 text-white/70 hover:border-white/50 hover:text-white"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={onWinLevel}
          className="w-full rounded border border-emerald-400/40 bg-emerald-500/15 py-1.5 font-bold text-emerald-200 transition-colors hover:bg-emerald-500/25"
        >
          Win current level
        </button>

        <label className="flex cursor-pointer items-center justify-between gap-2">
          <span>Peek tiles (no flip)</span>
          <input
            type="checkbox"
            checked={peek}
            onChange={onPeekToggle}
            className="h-3.5 w-3.5 accent-emerald-400"
          />
        </label>

        <p className="border-t border-white/10 pt-2 text-[10px] leading-snug text-white/40">
          Tile composition is generated per (size, level); x3 count is capped so the max score stays
          playable at any N. Every board is winnable.
        </p>
      </div>
    </div>
  );
}
