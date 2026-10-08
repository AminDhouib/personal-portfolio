import type { Op } from "./types";

/**
 * The hidden input always holds SENTINEL plus what was typed of the current
 * word. The sentinel gives Backspace something to delete at a word start, so
 * the browser still fires an input event for it.
 */
export const SENTINEL = " ";

/** Paste, drop and yank put text in without typing it. */
export const REJECTED_TYPES: readonly string[] = [
  "insertFromPaste",
  "insertFromDrop",
  "insertFromYank",
  "insertFromPasteAsQuotation",
];

const WORD_DELETE_TYPES: readonly string[] = [
  "deleteWordBackward",
  "deleteSoftLineBackward",
  "deleteHardLineBackward",
];

export interface InputDiff {
  ops: Op[];
  /** One event inserted several letters (a suggestion or autocorrect), or replaced text. */
  bulk: boolean;
  /** Paste, drop or yank: nothing was applied. */
  rejected: boolean;
}

/** Turns one input event (previous value, new value, inputType) into engine ops. */
export function diffInput(prev: string, next: string, inputType: string): InputDiff {
  if (REJECTED_TYPES.includes(inputType)) return { ops: [], bulk: false, rejected: true };
  let p = 0;
  while (p < prev.length && p < next.length && prev[p] === next[p]) p++;
  const removed = prev.length - p;
  const inserted = next.slice(p);
  const ops: Op[] = [];
  if (removed > 0) {
    if (WORD_DELETE_TYPES.includes(inputType)) ops.push({ kind: "backWord" });
    else for (let i = 0; i < removed; i++) ops.push({ kind: "back" });
  }
  let letters = 0;
  for (const ch of inserted) {
    if (ch === " ") {
      ops.push({ kind: "space" });
    } else {
      ops.push({ kind: "char", ch });
      letters++;
    }
  }
  const replaced = removed > 0 && inserted.length > 0;
  return {
    ops,
    bulk: letters > 1 || replaced || inputType === "insertReplacementText",
    rejected: false,
  };
}
