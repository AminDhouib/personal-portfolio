"use client";

import { useEffect, useState } from "react";

// The phone layer: with a coarse pointer the game opens in a fixed full-screen
// layer (Tower Stacker's and Hextris's precedent), and the page under it does
// not scroll while the layer is up. Play on the poster is the gesture that
// opens it, so it starts open; the player can leave it for the inline board
// and come back. A fine pointer never enters it.

function startsOpen(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

export function usePlaySheet() {
  const [sheet, setSheet] = useState(startsOpen);

  useEffect(() => {
    if (!sheet) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [sheet]);

  return { sheet, toggle: () => setSheet((open) => !open) };
}
