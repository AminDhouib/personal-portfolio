export const FLIP_MS = 490;
export const FLIP_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

export interface FlipMove {
  id: string;
  dy: number;
}

/** Inverse translations for items present in both layouts that moved by >= 1px. */
export function planFlip(prev: Map<string, number>, next: Map<string, number>): FlipMove[] {
  const out: FlipMove[] = [];
  for (const [id, before] of prev) {
    const after = next.get(id);
    if (after === undefined) continue;
    const dy = before - after;
    if (Math.abs(dy) >= 1) out.push({ id, dy });
  }
  return out;
}
