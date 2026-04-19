"use client";

export type MemoFlag = 1 | 2 | 3 | "V" | null;

export function MemoBar({
  activeFlag,
  onFlagSelect,
  size = 36,
  showLabel = true,
}: {
  activeFlag: MemoFlag;
  onFlagSelect: (f: MemoFlag) => void;
  size?: number;
  showLabel?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Memo flags"
      className="flex items-center gap-1 rounded-[6px] border-2 border-gray-300 bg-white/95 px-1.5 py-[2px] outline outline-2 outline-gray-600"
    >
      {showLabel && (
        <span className="pr-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 leading-none">
          Memo
        </span>
      )}
      {([1, 2, 3, "V"] as const).map((f) => {
        const imgName =
          f === "V"
            ? `s_${activeFlag === f ? "on" : "off"}`
            : `${(f as number) - 1}_${activeFlag === f ? "on" : "off"}`;
        return (
          <button
            key={f}
            onClick={() => onFlagSelect(activeFlag === f ? null : f)}
            aria-pressed={activeFlag === f}
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
    </div>
  );
}
