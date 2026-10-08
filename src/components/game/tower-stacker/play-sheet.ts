"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The phone play sheet: on Start with a coarse pointer the stage moves into a fixed
 * full-screen layer (the Hextris precedent) and page scroll is locked until the player
 * exits or the stage unmounts. A fine pointer never enters it.
 */
export function usePlaySheet() {
  const [sheet, setSheet] = useState(false);
  const previousOverflow = useRef<string | null>(null);

  const unlock = useCallback(() => {
    if (previousOverflow.current === null) return;
    document.documentElement.style.overflow = previousOverflow.current;
    previousOverflow.current = null;
  }, []);

  const enter = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return;
    if (previousOverflow.current === null) {
      previousOverflow.current = document.documentElement.style.overflow;
    }
    document.documentElement.style.overflow = "hidden";
    setSheet(true);
  }, []);

  const exit = useCallback(() => {
    unlock();
    setSheet(false);
  }, [unlock]);

  useEffect(() => unlock, [unlock]);

  return { sheet, enter, exit };
}
