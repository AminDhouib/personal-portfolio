"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ViewportLayout } from "@/hooks/viewport-layout";
import { TOUCH } from "./surface";

const COARSE = "(pointer: coarse)";

function subscribeCoarse(notify: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(COARSE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

function readCoarse(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(COARSE).matches;
}

/** True on a touch device (a coarse primary pointer): the phone play sheet and hand mode by default. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, readCoarse, () => false);
}

/** Stops the page behind the sheet from scrolling or rubber-banding while it is up. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const before = { overflow: root.style.overflow, overscroll: root.style.overscrollBehavior };
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    return () => {
      root.style.overflow = before.overflow;
      root.style.overscrollBehavior = before.overscroll;
    };
  }, [active]);
}

/**
 * The classes that turn the stage into the full-screen phone sheet. The sheet is as tall as the
 * visible area above the on-screen keyboard (a CSS var set from `visualViewport`, 100dvh until it
 * is known), so the Run bar stays in view while the player types.
 */
export const SHEET_CLASS =
  "fixed inset-x-0 z-80 content-start overflow-y-auto overscroll-contain bg-(--background) px-3 pb-3";

export function sheetStyle(viewport: ViewportLayout) {
  return {
    top: `${viewport.top}px`,
    height: viewport.height > 0 ? `${viewport.height}px` : "100dvh",
  };
}

/** The sheet's top row: Exit and what is being played. It stays put while the sheet scrolls. */
export function SheetHud({ title, onExit }: { title: string; onExit: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 bg-(--background) pt-2 pb-1 md:col-span-2">
      <button
        type="button"
        onClick={onExit}
        className={`rounded-md border border-(--border) px-4 py-1.5 text-sm font-medium text-(--foreground) ${TOUCH}`}
      >
        Exit
      </button>
      <span className="truncate font-mono text-xs text-(--muted)">{title}</span>
    </div>
  );
}
