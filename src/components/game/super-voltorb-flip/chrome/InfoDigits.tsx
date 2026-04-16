"use client";

import { Digit } from "./Digits";
import type { LineHint } from "../types";

/**
 * A single row-info panel's digits (2-digit points + 1-digit voltorb count).
 * Renders atop the colored panel chrome which is baked into the board-section
 * background image.
 */
export function RowInfoDigits({ hint, r }: { hint: LineHint; r: number }) {
  const tens = Math.floor(hint.points / 10);
  const ones = hint.points % 10;
  return (
    <>
      <Digit n={tens} variant="bold" x={180} y={23 + 32 * r} />
      <Digit n={ones} variant="bold" x={188} y={23 + 32 * r} />
      <Digit n={hint.voltorbs} variant="bold" x={188} y={36 + 32 * r} />
    </>
  );
}

/**
 * A single column-info panel's digits.
 */
export function ColInfoDigits({ hint, c }: { hint: LineHint; c: number }) {
  const tens = Math.floor(hint.points / 10);
  const ones = hint.points % 10;
  return (
    <>
      <Digit n={tens} variant="bold" x={20 + 32 * c} y={183} />
      <Digit n={ones} variant="bold" x={28 + 32 * c} y={183} />
      <Digit n={hint.voltorbs} variant="bold" x={28 + 32 * c} y={196} />
    </>
  );
}
