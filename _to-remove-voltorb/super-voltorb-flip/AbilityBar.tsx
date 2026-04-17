"use client";

import { Shield, Eye, DoorOpen } from "lucide-react";

export function AbilityBar({
  level,
  totalCoins,
  shieldArmed,
  voltorbRevealsUsed,
  currentCoins,
  onArmShield,
  onUseReveal,
  onCashOut,
}: {
  level: number;
  totalCoins: number;
  shieldArmed: boolean;
  voltorbRevealsUsed: number;
  currentCoins: number;
  onArmShield: () => void;
  onUseReveal: () => void;
  onCashOut: () => void;
}) {
  const shieldCost = 200 * level;
  const revealCost = 500 * level;
  const canArm = totalCoins >= shieldCost && !shieldArmed;
  const canReveal = totalCoins >= revealCost && voltorbRevealsUsed < 2;
  const canCashOut = currentCoins > 0;

  return (
    <div className="flex gap-2 flex-wrap justify-center mt-3">
      <button
        type="button"
        disabled={!canArm}
        onClick={onArmShield}
        className="px-3 py-2 rounded-md border border-(--border) flex items-center gap-2 text-sm disabled:opacity-40 hover:border-accent-blue transition"
        style={{
          borderColor: shieldArmed ? "#22c55e" : undefined,
          background: shieldArmed ? "rgba(34,197,94,0.15)" : "transparent",
        }}
      >
        <Shield className="w-4 h-4" />
        {shieldArmed ? "Shield Armed" : `Shield (${shieldCost}c)`}
      </button>
      <button
        type="button"
        disabled={!canReveal}
        onClick={onUseReveal}
        className="px-3 py-2 rounded-md border border-(--border) flex items-center gap-2 text-sm disabled:opacity-40 hover:border-accent-pink transition"
      >
        <Eye className="w-4 h-4" />
        Reveal ({revealCost}c) · {2 - voltorbRevealsUsed} left
      </button>
      <button
        type="button"
        disabled={!canCashOut}
        onClick={() => {
          if (typeof window !== "undefined" && window.confirm(`Cash out with ${currentCoins} coins? Your level won't change.`)) {
            onCashOut();
          }
        }}
        className="px-3 py-2 rounded-md border border-(--border) flex items-center gap-2 text-sm disabled:opacity-40 hover:border-accent-amber transition"
      >
        <DoorOpen className="w-4 h-4" />
        Cash Out
      </button>
    </div>
  );
}
