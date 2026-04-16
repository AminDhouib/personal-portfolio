"use client";

const NUM = "/games/super-voltorb-flip/sprites/number";

function BigDigit({ n }: { n: number }) {
  const idx = Math.max(0, Math.min(9, n));
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`${NUM}/big_${idx}.png`}
      alt=""
      className="h-8 w-auto"
      style={{ imageRendering: "pixelated" as const }}
      draggable={false}
    />
  );
}

function ThinDigit({ n }: { n: number }) {
  const idx = Math.max(1, Math.min(8, n));
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`${NUM}/thin_${idx}.png`}
      alt=""
      className="h-5 w-auto"
      style={{ imageRendering: "pixelated" as const }}
      draggable={false}
    />
  );
}

function padCoins(n: number, width = 5): number[] {
  const s = String(Math.max(0, Math.min(99999, n))).padStart(width, "0");
  return s.split("").map((ch) => Number(ch));
}

export function Scoreboard({
  level,
  currentCoins,
  totalCoins,
}: {
  level: number;
  currentCoins: number;
  totalCoins: number;
}) {
  return (
    <div className="flex flex-col gap-2 text-white text-xs font-mono">
      <div className="flex items-center gap-2">
        <span className="opacity-70">LV</span>
        <ThinDigit n={level} />
      </div>
      <div>
        <div className="opacity-70 text-[10px]">THIS ROUND</div>
        <div className="flex gap-0.5">
          {padCoins(currentCoins).map((d, i) => (
            <BigDigit key={i} n={d} />
          ))}
        </div>
      </div>
      <div>
        <div className="opacity-70 text-[10px]">TOTAL COINS</div>
        <div className="flex gap-0.5">
          {padCoins(totalCoins).map((d, i) => (
            <BigDigit key={i} n={d} />
          ))}
        </div>
      </div>
    </div>
  );
}
