// Offsets within this many pixels belong to the same line.
const SAME_LINE_PX = 1;

/**
 * How many leading words to drop so the caret's line becomes the second of
 * three. `tops` is each rendered word's offsetTop, starting at the first
 * rendered word; `cursor` indexes into it. Nothing is dropped while the cursor
 * is on the first or second line.
 */
export function nextTrim(tops: readonly number[], cursor: number): number {
  const cursorTop = tops[cursor];
  if (cursorTop === undefined) return 0;
  const lines: number[] = [];
  for (const top of tops) {
    const last = lines.at(-1);
    if (last === undefined || top > last + SAME_LINE_PX) lines.push(top);
  }
  const lineIndex = lines.findLastIndex((top) => top <= cursorTop + SAME_LINE_PX);
  if (lineIndex < 2) return 0;
  const first = lines[0] ?? 0;
  return tops.filter((top) => top <= first + SAME_LINE_PX).length;
}
