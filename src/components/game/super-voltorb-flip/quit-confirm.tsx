"use client";

import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent } from "react";

export type QuitConfirmProps = {
  /** Coins the round has earned so far; a quit banks them. */
  coins: number;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirmation for quitting a round, laid over the board (not the page). Focus
 * starts on Keep playing, the safe choice: HGSS's yes/no prompt starts on Yes, but
 * a mis-tap here should not end a round. Escape cancels, Tab stays between the two
 * buttons, and keys never reach the board's continue listener.
 */
export function QuitConfirm({ coins, onConfirm, onCancel }: QuitConfirmProps) {
  const titleId = useId();
  const messageId = useId();
  const keepRef = useRef<HTMLButtonElement | null>(null);
  const quitRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    e.preventDefault();
    const order = [keepRef.current, quitRef.current];
    const index = order.indexOf(document.activeElement as HTMLButtonElement | null);
    const step = e.shiftKey ? -1 : 1;
    order[(index + step + order.length) % order.length]?.focus();
  }

  const buttonClass =
    "min-h-11 min-w-11 cursor-pointer rounded-[6px] border-2 px-3 text-sm font-bold outline outline-2 outline-gray-600 focus-visible:outline-[#ef2020]";

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-3"
      onKeyDown={handleKeyDown}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="rounded-5 w-full max-w-[320px] border-2 border-gray-300 bg-white p-3 text-gray-700 shadow-[0_4px_0_rgba(0,0,0,0.18)] outline outline-2 outline-gray-600"
      >
        <h2 id={titleId} className="text-base font-bold text-gray-800">
          Quit this round?
        </h2>
        <p id={messageId} className="mt-1 text-sm">
          {coins > 0
            ? `Quit now and you keep ${coins} coins.`
            : "You have not found any coins this round."}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            ref={keepRef}
            type="button"
            onClick={onCancel}
            className={`${buttonClass} drop-shadow-default border-white bg-[#3D7757] text-white`}
          >
            Keep playing
          </button>
          <button
            ref={quitRef}
            type="button"
            onClick={onConfirm}
            className={`${buttonClass} border-gray-300 bg-white text-gray-700`}
          >
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}
