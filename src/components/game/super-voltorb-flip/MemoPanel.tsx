"use client";

import type { MemoMarks } from "./types";

const BTN = "/games/super-voltorb-flip/sprites/button/memo";

export function MemoPanel({
  open,
  selectedMemos,
  copyMode,
  onToggle,
  onMarkChange,
  onToggleCopy,
}: {
  open: boolean;
  selectedMemos: MemoMarks;
  copyMode: boolean;
  onToggle: () => void;
  onMarkChange: (idx: 0 | 1 | 2 | 3) => void;
  onToggleCopy: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 items-center p-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-16 h-8 bg-transparent border-0 p-0 cursor-pointer"
        aria-label={open ? "Close Memo" : "Open Memo"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={open ? `${BTN}/close.png` : `${BTN}/open.png`}
          alt=""
          className="w-full h-full"
          style={{ imageRendering: "pixelated" as const }}
          draggable={false}
        />
      </button>

      {open && (
        <>
          <div className="grid grid-cols-2 gap-1">
            {[0, 1, 2, 3].map((i) => {
              const on = selectedMemos[i];
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onMarkChange(i as 0 | 1 | 2 | 3)}
                  className="w-8 h-8 bg-transparent border-0 p-0 cursor-pointer"
                  aria-label={`Memo ${i === 0 ? "voltorb" : i}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${BTN}/${i}_${on ? "on" : "off"}.png`}
                    alt=""
                    className="w-full h-full"
                    style={{ imageRendering: "pixelated" as const }}
                    draggable={false}
                  />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onToggleCopy}
            className="w-8 h-8 bg-transparent border-0 p-0 cursor-pointer"
            aria-label="Toggle memo copy mode"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${BTN}/${copyMode ? "s_on" : "s_off"}.png`}
              alt=""
              className="w-full h-full"
              style={{ imageRendering: "pixelated" as const }}
              draggable={false}
            />
          </button>
        </>
      )}
    </div>
  );
}
