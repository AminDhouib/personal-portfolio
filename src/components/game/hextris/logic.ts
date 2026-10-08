// SPDX-License-Identifier: GPL-3.0-only
// Derived from Hextris, Copyright (C) 2018 Logan Engstrom and the Hextris
// contributors (Garrett Finucane, Noah Moroze, Michael Yang),
// https://github.com/Hextris/hextris, licensed under the GNU GPL v3.
// Modified by Amin Dhouib, 2026: ported to TypeScript and React, with new
// blocks, scoring bonuses, boundary, sound and UI. See ./COPYING
// and ./NOTICE.md.
import type { Point } from "./types";

// ═══════════════════════════════════════════════════════════════
// MATH HELPERS
// ═══════════════════════════════════════════════════════════════

export function rotatePoint(x: number, y: number, theta: number): Point {
  const r = (theta * Math.PI) / 180;
  return {
    x: Math.cos(r) * x - Math.sin(r) * y,
    y: Math.sin(r) * x + Math.cos(r) * y,
  };
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * max + min);
}
