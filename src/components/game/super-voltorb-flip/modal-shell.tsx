"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { VoltorbIcon } from "./chrome";

/**
 * The modal card the Settings, Statistics and Daily panels share. Same look as
 * the How to play card (it uses the .svf-modal-* classes from SCOPED_STYLES) and
 * the same dismissal: Escape, the close button, a click on the backdrop. It is
 * absolutely positioned inside .svf-root, so it covers the game, not the page.
 */
export function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, 180);
  }, [onClose]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  return (
    <div
      className={`svf-modal-backdrop absolute inset-0 z-[60] flex items-center justify-center overflow-y-auto p-3 ${
        closing ? "svf-modal-closing" : "svf-modal-open"
      }`}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="svf-modal-card rounded-5 my-auto w-full max-w-[460px] cursor-default border-4 border-gray-300 bg-white text-gray-700 outline outline-2 outline-gray-600"
      >
        <div className="flex items-center justify-between border-b-2 border-gray-200 px-4 py-2">
          <div className="flex items-center gap-2">
            <VoltorbIcon size={20} />
            <h1 className="drop-shadow-soft text-2xl leading-none">{title}</h1>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded border-2 border-gray-300 bg-white text-gray-600 transition-colors hover:bg-zinc-100"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
              <rect x="1" y="2" width="2" height="2" />
              <rect x="3" y="4" width="2" height="2" />
              <rect x="5" y="6" width="4" height="2" />
              <rect x="9" y="4" width="2" height="2" />
              <rect x="11" y="2" width="2" height="2" />
              <rect x="1" y="10" width="2" height="2" />
              <rect x="3" y="8" width="2" height="2" />
              <rect x="9" y="8" width="2" height="2" />
              <rect x="11" y="10" width="2" height="2" />
            </svg>
          </button>
        </div>
        <div className="drop-shadow-soft flex flex-col gap-4 p-4 text-base leading-snug">
          {children}
        </div>
      </div>
    </div>
  );
}
