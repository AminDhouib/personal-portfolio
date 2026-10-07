"use client";

import { PixelSprite } from "./art/pixel-sprite";
import { GLYPHS, GLYPH_CLEAR } from "./art/sprites";

export type MemoFlag = 1 | 2 | 3 | "V";

// Set of currently-active memo flags. The user can toggle multiple at
// once (mark a tile as "could be 1 or 2"); a back/clear button wipes
// all flags in one go. Stored as a `Set` so order doesn't matter.
export type MemoFlagSet = ReadonlySet<MemoFlag>;

const ALL_FLAGS: MemoFlag[] = ["V", 1, 2, 3];

// Two complete static class strings (never a conditional fragment) so the
// Tailwind prettier plugin cannot re-fuse a modifier separator.
const FACE_OFF =
  "flex items-center justify-center rounded-[4px] border-2 border-gray-400 bg-gray-100";
const FACE_ON =
  "flex items-center justify-center rounded-[4px] border-2 border-[#b87512] bg-[#efa539]";

function MemoFace({
  sprite,
  active,
  size,
}: {
  sprite: (typeof GLYPHS)[MemoFlag] | typeof GLYPH_CLEAR;
  active: boolean;
  size: number;
}) {
  return (
    <span className={active ? FACE_ON : FACE_OFF} style={{ width: size, height: size }}>
      <PixelSprite
        sprite={sprite}
        cssSize="62%"
        style={{ color: active ? "#1f2937" : "#4b5563" }}
      />
    </span>
  );
}

export function MemoBar({
  activeFlags,
  onToggle,
  onClear,
  size = 36,
  showLabel = true,
  fullWidth = false,
}: {
  activeFlags: MemoFlagSet;
  onToggle: (f: MemoFlag) => void;
  onClear: () => void;
  size?: number;
  showLabel?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Memo flags"
      className={`flex h-11 ${fullWidth ? "w-full" : ""} items-center gap-1 rounded-[6px] border-2 border-gray-300 bg-white/95 px-1.5 outline outline-2 outline-gray-600`}
    >
      {showLabel && (
        <span className="pr-1 text-[10px] leading-none font-bold tracking-widest text-gray-500 uppercase">
          Memo
        </span>
      )}
      {ALL_FLAGS.map((f) => {
        const active = activeFlags.has(f);
        return (
          <button
            key={String(f)}
            onClick={() => onToggle(f)}
            aria-pressed={active}
            aria-label={`Memo ${f}`}
            title={`Tag tiles as ${f}`}
            className="rounded-sm transition-opacity hover:opacity-80"
          >
            <MemoFace sprite={GLYPHS[f]} active={active} size={size} />
          </button>
        );
      })}
      <button
        onClick={onClear}
        aria-label="Clear all memo flags"
        title="Clear all memo flags"
        className="rounded-sm transition-opacity hover:opacity-80"
      >
        <MemoFace sprite={GLYPH_CLEAR} active={false} size={size} />
      </button>
    </div>
  );
}
