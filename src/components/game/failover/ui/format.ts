// Number formats the HUD shares.

/** Game seconds as m:ss. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Whole dollars with thousands separators; a debt keeps its minus sign. */
export function money(amount: number): string {
  const whole = Math.trunc(amount);
  return `${whole < 0 ? "-" : ""}$${Math.abs(whole).toLocaleString("en-US")}`;
}

/** A 0-1 fraction as a whole percentage. */
export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
