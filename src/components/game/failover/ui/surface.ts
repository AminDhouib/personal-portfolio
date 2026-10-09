// Shared look for Failover's controls. On a phone every control the player
// taps is at least 44 px square (min-h-11 min-w-11), keyed to a coarse pointer
// so the desktop layout is unchanged; touch-targets.test.tsx pins it.

export const TOUCH = "pointer-coarse:min-h-11 pointer-coarse:min-w-11";

export const PANEL = "rounded-md border border-[#27272a] bg-[#0b0b0d]/90 text-[#d4d4d8]";

export const BUTTON = `inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md border px-2 text-xs transition-colors ${TOUCH}`;

export const BUTTON_IDLE = "border-[#27272a] bg-[#0b0b0d]/90 text-[#d4d4d8] hover:border-[#52525b]";

export const BUTTON_ON = "border-[#06b6d4] bg-[#06b6d4]/15 text-[#06b6d4]";
