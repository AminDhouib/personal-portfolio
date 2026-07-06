"use client";

export type MemoFlag = 1 | 2 | 3 | "V";

// Set of currently-active memo flags. The user can toggle multiple at
// once (mark a tile as "could be 1 or 2"); a back/clear button wipes
// all flags in one go. Stored as a `Set` so order doesn't matter.
export type MemoFlagSet = ReadonlySet<MemoFlag>;

const ALL_FLAGS: MemoFlag[] = ["V", 1, 2, 3];

// Asset name in /button/memo/ — the upstream sprite file numbering does
// NOT match the flag value. 0_*.png is the voltorb button, 1_*.png is
// "1", 2_*.png is "2", 3_*.png is "3", and s_*.png is the back button.
function assetForFlag(f: MemoFlag): string {
  if (f === "V") return "0";
  return String(f);
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
        const imgName = `${assetForFlag(f)}_${active ? "on" : "off"}`;
        return (
          <button
            key={String(f)}
            onClick={() => onToggle(f)}
            aria-pressed={active}
            aria-label={`Memo ${f}`}
            title={`Tag tiles as ${f}`}
            className="rounded-sm transition-opacity hover:opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/games/super-voltorb-flip/sprites/upstream/button/memo/${imgName}.png`}
              width={size}
              height={size}
              alt=""
              style={{ imageRendering: "pixelated" }}
            />
          </button>
        );
      })}
      <button
        onClick={onClear}
        aria-label="Clear all memo flags"
        title="Clear all memo flags"
        className="rounded-sm transition-opacity hover:opacity-80"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/games/super-voltorb-flip/sprites/upstream/button/memo/s_off.png"
          width={size}
          height={size}
          alt=""
          style={{ imageRendering: "pixelated" }}
        />
      </button>
    </div>
  );
}
