"use client";

const ASSETS = "/games/super-voltorb-flip/sprites";

type Variant = "big" | "bold" | "thin";

const PIXEL: React.CSSProperties = {
  imageRendering: "pixelated",
  display: "block",
  userSelect: "none",
  pointerEvents: "none",
};

export function Digit({
  n,
  variant,
  x,
  y,
}: {
  n: number;
  variant: Variant;
  x: number;
  y: number;
}) {
  const clamped =
    variant === "thin"
      ? Math.max(1, Math.min(8, n))
      : Math.max(0, Math.min(9, n));
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${ASSETS}/number/${variant}_${clamped}.png`}
      alt=""
      draggable={false}
      style={{ ...PIXEL, position: "absolute", left: x, top: y }}
    />
  );
}

/**
 * Render a 5-digit coin counter with leading zeros, right-aligned.
 * baseX is the x-coord of the right-most (ones) digit.
 * Follows the original HGSS stride of 16px per digit.
 */
export function CoinDigits({
  value,
  baseX,
  y,
}: {
  value: number;
  baseX: number;
  y: number;
}) {
  const v = Math.max(0, Math.min(99999, value));
  return (
    <>
      {[4, 3, 2, 1, 0].map((i) => (
        <Digit
          key={i}
          n={Math.floor(v / Math.pow(10, i)) % 10}
          variant="big"
          x={baseX - 16 * i}
          y={y}
        />
      ))}
    </>
  );
}
