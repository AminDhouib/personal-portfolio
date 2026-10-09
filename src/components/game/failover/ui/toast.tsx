"use client";

/**
 * The one-line message the controller raises (a refusal, a made link): a live
 * region, so a screen reader hears it, kept mounted so the announcement fires.
 */
export function Toast({ text }: { text: string | null }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="pointer-events-none min-h-5 rounded bg-[#0b0b0d]/80 px-2 text-xs text-[#f59e0b] empty:bg-transparent"
    >
      {text ?? ""}
    </p>
  );
}
