"use client";

export function MemoPanel({
  mode,
  flag,
  onToggleMode,
  onFlagChange,
}: {
  mode: boolean;
  flag: 1 | 2 | 3 | "V";
  onToggleMode: () => void;
  onFlagChange: (f: 1 | 2 | 3 | "V") => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={onToggleMode}
        aria-pressed={mode}
        className="transition-opacity hover:opacity-80"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/games/super-voltorb-flip/sprites/upstream/button/memo/${mode ? "close" : "open"}.png`}
          width={60}
          height={60}
          alt={mode ? "Close Memo" : "Open Memo"}
          style={{ imageRendering: "pixelated" }}
        />
      </button>
      {mode && (
        <div className="flex gap-1">
          {([1, 2, 3, "V"] as const).map((f) => {
            const imgName = f === "V" ? `s_${flag === f ? "on" : "off"}` : `${(f as number) - 1}_${flag === f ? "on" : "off"}`;
            return (
              <button
                key={f}
                onClick={() => onFlagChange(f)}
                aria-pressed={flag === f}
                className="transition-opacity hover:opacity-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/games/super-voltorb-flip/sprites/upstream/button/memo/${imgName}.png`}
                  width={36}
                  height={36}
                  alt={`Memo ${f}`}
                  style={{ imageRendering: "pixelated" }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
